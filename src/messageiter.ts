import type * as Model from "./model/index.js";
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
  private localIdx: number | undefined = undefined;
  private localExhausted: boolean = false;

  constructor(
    readonly did: string,
    readonly servers: Servers,
    readonly dbPeer: DbPeer,
    readonly pageSize: number,
    readonly serverCursors: ServerCursor[],
    readonly messagesId: Set<string>
  ) {}

  static async new(
    did: string,
    servers: Servers,
    dbPeer: DbPeer,
    pageSize: number
  ): Promise<MessageIter> {
    const cursors = [...servers.urlsServer.values()].map((x) => ({
      url: x.url,
      did,
      startIdx: undefined,
      exhausted: false,
    }));
    return new MessageIter(did, servers, dbPeer, pageSize, cursors, new Set());
  }

  getNumCycles(): number {
    return this.numCycles;
  }

  async *messages(): AsyncGenerator<Model.Message> {
    this.numCycles = 0;
    while (true) {
      // get from local first
      if (!this.localExhausted) {
        let pageOut = await this.dbPeer.message.getPage(this.localIdx, this.pageSize);
        if (pageOut.nextStartIdx == null || pageOut.ids.length <= 0) this.localExhausted = true;
        this.localIdx = pageOut.nextStartIdx;
        for (const messageId of pageOut.ids) {
          if (this.messagesId.has(messageId)) continue;
          // db stores message IDs separate from message object
          const message = (await this.dbPeer.document.get(messageId)) as Model.Message;
          if (!message) continue;
          this.messagesId.add(messageId);
          yield message;
        }
      }

      // then get messages from servers
      const numServers = this.serverCursors.length;
      for (let serverIdx = 0; serverIdx < numServers; serverIdx++) {
        const { url, did, startIdx, exhausted } = this.serverCursors[serverIdx];
        if (exhausted) continue;
        let inboxOut: InboxOut | undefined = undefined;
        try {
          inboxOut = await this.servers.getInbox(url, did, startIdx, this.pageSize);
        } catch {}
        if (inboxOut == null) continue;
        if (inboxOut.nextStartIdx == null || inboxOut.messages.length <= 0)
          this.serverCursors[serverIdx].exhausted = true;
        this.serverCursors[serverIdx].startIdx = inboxOut.nextStartIdx;
        for (const message of inboxOut.messages) {
          if (this.messagesId.has(message.id)) continue;
          this.messagesId.add(message.id);
          yield message;
        }
      }

      this.numCycles += 1;
      if (this.localExhausted && this.serverCursors.every((x) => x.exhausted)) break;
    }
  }
}
