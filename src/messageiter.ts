import type * as Messages from "./messages.js";
import type { Servers } from "./servers.js";
import type { DbPeer } from "./storage.js";

interface ServerCursor {
  url: string;
  did: string;
  cursor: string | undefined;
}

export class MessageIter {
  private numCycles: number = 0;
  private localCursor: string | undefined = undefined;

  constructor(
    readonly did: string,
    readonly servers: Servers,
    readonly serverCursors: ServerCursor[],
    readonly dbPeer: DbPeer,
    readonly messagesId: Set<string>
  ) {}

  static async new(did: string, servers: Servers, dbPeer: DbPeer): Promise<MessageIter> {
    const cursors = [...servers.urlsServer.values()].map((x) => ({
      url: x.url,
      did,
      cursor: undefined,
    }));
    return new MessageIter(did, servers, cursors, dbPeer, new Set());
  }

  getNumCycles(): number {
    return this.numCycles;
  }

  async *messages(): AsyncGenerator<Messages.MessageWithId> {
    this.numCycles = 0;
    while (true) {
      let yielded = false;

      // get from local first
      for (const messageId of await this.dbPeer.message.getPage(this.localCursor)) {
        if (this.messagesId.has(messageId)) continue;
        // db stores message IDs separate from message object
        const message = (await this.dbPeer.objectDoc.get(messageId)) as Messages.MessageWithId;
        if (!message) continue;
        this.messagesId.add(messageId);
        this.localCursor = messageId;
        yielded = true;
        yield message;
      }

      // then get messages from servers
      const numServers = this.serverCursors.length;
      for (let serverIdx = 0; serverIdx < numServers; serverIdx++) {
        const { url, did, cursor } = this.serverCursors[serverIdx];
        let inbox: Messages.MessageWithId[] = [];
        try {
          inbox = await this.servers.getInbox(url, did, cursor);
        } catch {}
        for (const message of inbox) {
          if (this.messagesId.has(message.id)) continue;
          this.messagesId.add(message.id);
          this.serverCursors[serverIdx].cursor = message.id;
          yielded = true;
          yield message;
        }
      }

      this.numCycles += 1;
      if (!yielded) break;
    }
  }
}
