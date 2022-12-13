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
      await Messages.newMessage(actorDid, ["urn:cid:a"], "Create", null, key),
      await Messages.newMessage(actorDid, ["urn:cid:b"], "Create", null, key),
      await Messages.newMessage(actorDid, ["urn:cid:c"], "Create", null, key),
    ];

    const messagesB = [
      messagesA[0],
      await Messages.newMessage(actorDid, ["urn:cid:d"], "Create", null, key),
    ];

    const messagesLocal = [
      await Messages.newMessage(actorDid, ["urn:cid:e"], "Create", null, key),
      await Messages.newMessage(actorDid, ["urn:cid:f"], "Create", null, key),
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
    servers.getInbox = async (url: string, did: string, after?: string) => {
      if (url === "http://a.example") {
        if (did === actorDid) {
          if (after == null) return messagesA.slice(0, 2);
          else if (after === messagesA[1].id) return messagesA.slice(1, 1 + 2);
          else if (after === messagesA[2].id) return messagesA.slice(2, 2 + 2);
          else return [];
        } else {
          return [];
        }
      } else if (url === "http://b.example") {
        if (did === actorDid) {
          if (after == null) return messagesB;
          else return [];
        } else {
          return [];
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
        ["urn:cid:f", 0],
        ["urn:cid:e", 0],
        // first page of server a (order sent by server)
        ["urn:cid:a", 0],
        ["urn:cid:b", 0],
        // only page of server b (order sent by server)
        ["urn:cid:d", 0],
        // second page of server a (order sent by server)
        // num cycles increases due to first full cycle
        ["urn:cid:c", 1],
      ]
    );
  });
});
