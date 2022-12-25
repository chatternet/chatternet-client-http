import * as DidKey from "../src/didkey.js";
import { MessageIter } from "../src/messageiter.js";
import * as Model from "../src/model/index.js";
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

    const messagesB = [
      messagesA[2],
      await Model.newMessage(actorDid, ["urn:cid:b1"], "Create", null, key),
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

    const servers = Servers.fromInfos([
      { url: "http://a.example", did: "did:example:a" },
      { url: "http://b.example", did: "did:example:b" },
    ]);
    servers.getInbox = async (url: string, did: string, startIdx?: number, pageSize?: number) => {
      pageSize = pageSize ? pageSize : 1;
      if (url === "http://a.example") {
        if (did === actorDid) {
          startIdx = startIdx ? startIdx : 3;
          const nextStartIdx = startIdx - pageSize > 0 ? startIdx - pageSize : undefined;
          if (startIdx === 3)
            return { messages: [...messagesA].reverse().slice(0, pageSize), nextStartIdx };
          else if (startIdx === 2)
            return { messages: [...messagesA].reverse().slice(1, 1 + pageSize), nextStartIdx };
          else if (startIdx === 1)
            return { messages: [...messagesA].reverse().slice(2, 2 + pageSize), nextStartIdx };
          else return { messages: [] };
        } else {
          return { messages: [] };
        }
      } else if (url === "http://b.example") {
        if (did === actorDid) {
          startIdx = startIdx ? startIdx : 1;
          if (startIdx === 1) return { messages: messagesB.slice(0, pageSize) };
          else return { messages: [] };
        } else {
          return { messages: [] };
        }
      } else throw Error("server URL is not known");
    };

    const messageIter = await MessageIter.new(actorDid, servers, dbPeer, 2);
    const messages: Model.Message[] = [];
    const numCycles: number[] = [];
    for await (const message of messageIter.messages()) {
      messages.push(message);
      numCycles.push(messageIter.getNumCycles());
    }
    const objectsIds = messages.map((x) => x.object[0]);
    assert.deepEqual(
      objectsIds.map((x, i) => [x, numCycles[i]]),
      [
        // local messages first in reverse order
        ["urn:cid:l3", 0],
        ["urn:cid:l2", 0],
        // first page of server a (order sent by server)
        ["urn:cid:a3", 0],
        ["urn:cid:a2", 0],
        // only page of server b (order sent by server)
        ["urn:cid:b1", 0],
        // second page of server a (order sent by server)
        // num cycles increases due to first full cycle
        ["urn:cid:l1", 1],
        ["urn:cid:a1", 1],
      ]
    );
  });
});
