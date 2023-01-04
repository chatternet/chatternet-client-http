import * as Model from "./model/index.js";
import type { PageIter } from "./pageiter.js";
import type { DbPeer } from "./storage.js";

export class MessageIter {
  private pageNumber: number = 0;
  private localIdx: number | undefined = undefined;
  private localExhausted: boolean = false;

  constructor(readonly dbPeer: DbPeer, readonly pageIter: PageIter<Model.Message>) {}

  getPageNumber(): number {
    return this.pageNumber;
  }

  async *messages(): AsyncGenerator<Model.Message> {
    while (true) {
      if (this.localExhausted && this.pageIter.serverCursors.every((x) => x.exhausted)) break;

      // get from local first
      if (!this.localExhausted) {
        let pageOut = await this.dbPeer.message.getPage(this.localIdx, this.pageIter.pageSize);
        if (pageOut.nextStartIdx == null || pageOut.ids.length <= 0) this.localExhausted = true;
        this.localIdx = pageOut.nextStartIdx;
        for (const messageId of pageOut.ids) {
          if (this.pageIter.skipIds.has(messageId)) continue;
          // db stores message IDs separate from message object
          const message = (await this.dbPeer.document.get(messageId)) as Model.Message;
          if (!message) continue;
          this.pageIter.skipIds.add(messageId);
          yield message;
        }
      }

      // then get messages from servers
      for await (const message of this.pageIter.pageItems()) {
        if (!(await Model.verifyMessage(message))) continue;
        yield message;
      }

      this.pageNumber += 1;
    }
  }
}
