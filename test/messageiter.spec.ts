import * as DidKey from "../src/didkey.js";
import { MessageIter } from "../src/messageiter.js";
import * as Messages from "../src/messages.js";
import { Servers } from "../src/servers.js";
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

    const servers = Servers.fromUrls(["https://a.example", "https://b.example"]);
    servers.getInbox = async (url: string, did: string, after?: string) => {
      if (url === "https://a.example") {
        if (did !== actorDid) return [];
        if (after == null) return messagesA.slice(0, 2);
        else if (after == messagesA[1].id) return messagesA.slice(1, 1 + 2);
        else if (after == messagesA[2].id) return messagesA.slice(2, 2 + 2);
        else return [];
      } else if (url === "https://b.example") {
        if (did !== actorDid) return [];
        return messagesB;
      } else throw Error("server URL is not known");
    };

    const messageIter = await MessageIter.new(actorDid, servers);
    assert.equal((await messageIter.next())?.object[0], "urn:cid:a");
    assert.equal((await messageIter.next())?.object[0], "urn:cid:b");
    assert.equal((await messageIter.next())?.object[0], "urn:cid:d");
    assert.equal((await messageIter.next())?.object[0], "urn:cid:c");
    assert.ok(!(await messageIter.next()));
  });
});
