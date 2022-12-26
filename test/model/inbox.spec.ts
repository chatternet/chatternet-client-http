import { DidKey, Model } from "../../src/index.js";
import * as assert from "assert";

describe("model inbox", () => {
  it("builds an inbox", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Model.newMessage(did, ["urn:cid:a"], "Create", null, jwk);
    const inbox = Model.newInbox("did:example:a/actor", [message], 0, 3);
    assert.equal(inbox.id, "did:example:a/actor/inbox?startIdx=0&pageSize=3");
    assert.equal(inbox.partOf, "did:example:a/actor/inbox");
    assert.equal(inbox.items[0].id, message.id);
    assert.ok(!inbox.next);
  });

  it("builds an inbox with next", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Model.newMessage(did, ["urn:cid:a"], "Create", null, jwk);
    const inbox = Model.newInbox("did:example:a/actor", [message], 0, 3, 2);
    assert.equal(inbox.id, "did:example:a/actor/inbox?startIdx=0&pageSize=3");
    assert.equal(inbox.next, "did:example:a/actor/inbox?startIdx=2&pageSize=3");
  });
});
