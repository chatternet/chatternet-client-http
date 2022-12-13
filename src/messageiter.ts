import type * as Messages from "./messages.js";
import type { InboxOut, Servers } from "./servers.js";
import type { DbPeer } from "./storage.js";

interface ServerCursor {
  url: string;
  did: string;
  startIdx: number | undefined;
  exhausted: boolean;
}

export class MessageIter {
  private numCycles: number = 0;
  // TODO fix
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
      startIdx: undefined,
      exhausted: false,
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
        const { url, did, startIdx: cursor, exhausted } = this.serverCursors[serverIdx];
        if (exhausted) continue;
        let inboxOut: InboxOut | undefined = undefined;
        try {
          inboxOut = await this.servers.getInbox(url, did, cursor);
        } catch {}
        if (inboxOut == null) continue;
        if (inboxOut.nextStartIdx == null) this.serverCursors[serverIdx].exhausted = true;
        this.serverCursors[serverIdx].startIdx = inboxOut.nextStartIdx;
        for (const message of inboxOut.messages) {
          if (this.messagesId.has(message.id)) continue;
          this.messagesId.add(message.id);
          yielded = true;
          yield message;
        }
      }

      this.numCycles += 1;
      if (!yielded) break;
    }
  }
}
