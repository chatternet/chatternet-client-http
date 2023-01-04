import * as DidKey from "../src/didkey.js";
import { MessageIter } from "../src/messageiter.js";
import * as Model from "../src/model/index.js";
import { PageIter } from "../src/pageiter.js";
import { Servers } from "../src/servers.js";
import { DbPeer } from "../src/storage.js";
import * as assert from "assert";

describe("message iter", () => {
  it("iterates messages and returns undefined when done", async () => {
    const key = await DidKey.newKey();
    const actorDid = DidKey.didFromKey(key);

    const messagesA = [
      await Model.newMessage(actorDid, ["urn:cid:a1"], "Create", null, key),
      await Model.newMessage(actorDid, ["urn:cid:a2"], "Create", null, key),
      await Model.newMessage(actorDid, ["urn:cid:a3"], "Create", null, key),
    ];

    const messagesLocal = [
      await Model.newMessage(actorDid, ["urn:cid:l1"], "Create", null, key),
      await Model.newMessage(actorDid, ["urn:cid:l2"], "Create", null, key),
      await Model.newMessage(actorDid, ["urn:cid:l3"], "Create", null, key),
    ];

    const dbPeer = await DbPeer.new();
    for (const messageLocal of messagesLocal) {
      await dbPeer.document.put(messageLocal);
      await dbPeer.message.put(messageLocal.id);
    }

    const servers = Servers.fromInfos([{ url: "http://a.example", did: "did:example:a" }]);

    servers.getPaginated = async (
      uri: string,
      serverUrl: string,
      startIdx?: number,
      pageSize?: number
    ) => {
      pageSize = pageSize ? pageSize : 1;
      if (serverUrl !== "http://a.example") throw Error("server URL is not known");
      if (uri.startsWith(`${actorDid}/actor/inbox`)) {
        startIdx = startIdx ? startIdx : 3;
        const nextStartIdx = startIdx - pageSize > 0 ? startIdx - pageSize : undefined;
        if (startIdx === 3)
          return { items: [...messagesA].reverse().slice(0, pageSize), nextStartIdx };
        else if (startIdx === 2)
          return { items: [...messagesA].reverse().slice(1, 1 + pageSize), nextStartIdx };
        else if (startIdx === 1)
          return { items: [...messagesA].reverse().slice(2, 2 + pageSize), nextStartIdx };
        else return { items: [] };
      } else {
        return { items: [] };
      }
    };

    const uri = `${actorDid}/actor/inbox`;
    const pageIter = PageIter.new<Model.Message>(uri, servers, 2, Model.isMessage);

    const messageIter = new MessageIter(dbPeer, pageIter);
    const objectsId: [string, number][] = [];
    for await (const message of messageIter.messages()) {
      objectsId.push([message.object[0], messageIter.getPageNumber()]);
    }
    assert.deepEqual(objectsId, [
      // local messages first in reverse order
      ["urn:cid:l3", 0],
      ["urn:cid:l2", 0],
      // first page of server a (order sent by server)
      ["urn:cid:a3", 0],
      ["urn:cid:a2", 0],
      // second page of server a (order sent by server)
      // num cycles increases due to first full cycle
      ["urn:cid:l1", 1],
      ["urn:cid:a1", 1],
    ]);
  });
});
