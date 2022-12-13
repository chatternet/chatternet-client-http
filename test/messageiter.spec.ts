import * as DidKey from "../src/didkey.js";
import { MessageIter } from "../src/messageiter.js";
import * as Messages from "../src/messages.js";
import { Servers } from "../src/servers.js";
import { DbPeer } from "../src/storage.js";
import * as assert from "assert";

describe("message iter", () => {
  it("iterates messages and returns undefined when done", async () => {
    const key = await DidKey.newKey();
    const actorDid = DidKey.didFromKey(key);

    const messagesA = [
      await Messages.newMessage(actorDid, ["urn:cid:a3"], "Create", null, key),
      await Messages.newMessage(actorDid, ["urn:cid:a2"], "Create", null, key),
      await Messages.newMessage(actorDid, ["urn:cid:a1"], "Create", null, key),
    ];

    const messagesB = [
      messagesA[0],
      await Messages.newMessage(actorDid, ["urn:cid:b1"], "Create", null, key),
    ];

    const messagesLocal = [
      await Messages.newMessage(actorDid, ["urn:cid:l1"], "Create", null, key),
      await Messages.newMessage(actorDid, ["urn:cid:l2"], "Create", null, key),
    ];

    const dbPeer = await DbPeer.new();
    await dbPeer.objectDoc.put(messagesLocal[0]);
    await dbPeer.message.put(messagesLocal[0].id);
    await dbPeer.objectDoc.put(messagesLocal[1]);
    await dbPeer.message.put(messagesLocal[1].id);

    const servers = Servers.fromInfos([
      { url: "http://a.example", did: "did:example:a" },
      { url: "http://b.example", did: "did:example:b" },
    ]);
    servers.getInbox = async (url: string, did: string, startIdx?: number) => {
      if (url === "http://a.example") {
        if (did === actorDid) {
          if (startIdx === 1 || startIdx == null)
            return { messages: messagesA.slice(0, 2), nextStartIdx: 3 };
          else if (startIdx === 2) return { messages: messagesA.slice(1, 1 + 2) };
          else if (startIdx === 3) return { messages: messagesA.slice(2, 2 + 2) };
          else return { messages: [] };
        } else {
          return { messages: [] };
        }
      } else if (url === "http://b.example") {
        if (did === actorDid) {
          if (startIdx === 1 || startIdx == null) return { messages: messagesB.slice(0, 2) };
          else return { messages: [] };
        } else {
          return { messages: [] };
        }
      } else throw Error("server URL is not known");
    };

    const messageIter = await MessageIter.new(actorDid, servers, dbPeer);
    const messages: Messages.MessageWithId[] = [];
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
        ["urn:cid:l2", 0],
        ["urn:cid:l1", 0],
        // first page of server a (order sent by server)
        ["urn:cid:a3", 0],
        ["urn:cid:a2", 0],
        // only page of server b (order sent by server)
        ["urn:cid:b1", 0],
        // second page of server a (order sent by server)
        // num cycles increases due to first full cycle
        ["urn:cid:a1", 1],
      ]
    );
  });
});
