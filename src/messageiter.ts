import type * as Messages from "./messages.js";
import type { Servers } from "./servers.js";

export class MessageIter {
  idx: number = 0;
  cursor: string | undefined = undefined;

  constructor(
    readonly did: string,
    readonly servers: Servers,
    readonly urlToCursor: Map<string, string | undefined>,
    readonly messages: Messages.MessageWithId[],
    readonly messagesId: Set<string>
  ) {}

  static async new(did: string, servers: Servers): Promise<MessageIter> {
    const urls = [...servers.urlsServer.keys()];
    return new MessageIter(did, servers, new Map(urls.map((x) => [x, undefined])), [], new Set());
  }

  async next(): Promise<Messages.MessageWithId | undefined> {
    for (const [url, cursor] of [...this.urlToCursor.entries()]) {
      if (this.cursor !== cursor) continue;
      for (const message of await this.servers.getInbox(url, this.did, cursor)) {
        if (this.messagesId.has(message.id)) continue;
        this.messagesId.add(message.id);
        this.messages.push(message);
        this.urlToCursor.set(url, message.id);
      }
    }
    if (this.messages.length <= this.idx) return undefined;
    const message = this.messages[this.idx++];
    this.cursor = message.id;
    return message;
  }
}
