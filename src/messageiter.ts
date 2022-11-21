import type * as Messages from "./messages.js";
import type { Servers } from "./servers.js";

interface ServerCursor {
  url: string;
  did: string;
  cursor: string | undefined;
}

export class MessageIter {
  idx: number = 0;
  cursor: string | undefined = undefined;

  constructor(
    readonly did: string,
    readonly servers: Servers,
    readonly serverCursors: ServerCursor[],
    readonly messages: Messages.MessageWithId[],
    readonly messagesId: Set<string>
  ) {}

  static async new(did: string, servers: Servers): Promise<MessageIter> {
    // local inbox from all servers
    const local = [...servers.urlsServer.values()].map((x) => ({
      url: x.url,
      did,
      cursor: undefined,
    }));
    // global inbox from all servers
    const global = [...servers.urlsServer.values()].map((x) => ({
      url: x.url,
      did: x.did,
      cursor: undefined,
    }));
    return new MessageIter(did, servers, [...local, ...global], [], new Set());
  }

  async next(): Promise<Messages.MessageWithId | undefined> {
    const numServers = this.serverCursors.length;
    for (let serverIdx = 0; serverIdx < numServers; serverIdx++) {
      const { url, did, cursor } = this.serverCursors[serverIdx];
      if (this.cursor !== cursor) continue;
      for (const message of await this.servers.getInbox(url, did, cursor)) {
        if (this.messagesId.has(message.id)) continue;
        this.messagesId.add(message.id);
        this.messages.push(message);
        this.serverCursors[serverIdx].cursor = message.id;
      }
    }
    if (this.messages.length <= this.idx) return undefined;
    const message = this.messages[this.idx++];
    this.cursor = message.id;
    return message;
  }
}
