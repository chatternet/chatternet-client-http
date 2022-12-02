import type * as Messages from "./messages.js";
import type { Servers } from "./servers.js";
import type { DbPeer } from "./storage.js";

interface ServerCursor {
  url: string;
  did: string;
  cursor: string | undefined;
}

export class MessageIter {
  idx: number = 0;
  cursor: string | undefined = undefined;
  localCursor: string | undefined = undefined;

  constructor(
    readonly did: string,
    readonly servers: Servers,
    readonly serverCursors: ServerCursor[],
    readonly dbPeer: DbPeer,
    readonly messages: Messages.MessageWithId[],
    readonly messagesId: Set<string>
  ) {}

  static async new(did: string, servers: Servers, dbPeer: DbPeer): Promise<MessageIter> {
    const cursors = [...servers.urlsServer.values()].map((x) => ({
      url: x.url,
      did,
      cursor: undefined,
    }));
    return new MessageIter(did, servers, cursors, dbPeer, [], new Set());
  }

  async next(): Promise<Messages.MessageWithId | undefined> {
    // get from local first
    if (this.cursor == this.localCursor) {
      for (const messageId of await this.dbPeer.message.getPage(this.localCursor)) {
        if (this.messagesId.has(messageId)) continue;
        // db stores message IDs separate from message object
        const message = (await this.dbPeer.objectDoc.get(messageId)) as Messages.MessageWithId;
        if (!message) continue;
        this.messagesId.add(messageId);
        this.messages.push(message);
        this.localCursor = messageId;
      }
    }

    // then get messages from servers
    const numServers = this.serverCursors.length;
    for (let serverIdx = 0; serverIdx < numServers; serverIdx++) {
      const { url, did, cursor } = this.serverCursors[serverIdx];
      if (this.cursor !== cursor) continue;
      let inbox: Messages.MessageWithId[] = [];
      try {
        inbox = await this.servers.getInbox(url, did, cursor);
      } catch {}
      for (const message of inbox) {
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
