import { DidKey, Model } from "../../src/index.js";
import { sign } from "../../src/signatures.js";
import * as assert from "assert";
import { omit } from "lodash-es";

describe("model message", () => {
  it("builds and verifies a message", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Model.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: ["did:example:a"],
    });
    assert.ok(await Model.verifyMessage(message));
    assert.ok(message.actor.startsWith(did));
    assert.equal(message.object, "urn:cid:a");
    assert.equal(message.to, "did:example:a");
  });

  it("doesnt verify modified message", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Model.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: ["did:example:a"],
    });
    message.to = ["did:example:b"];
    assert.ok(!(await Model.verifyMessage(message)));
  });

  it("doesnt verify message with invalid ID", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Model.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: ["did:example:a"],
    });
    let invalid = await sign({ ...omit(message, "proof"), id: "urn:cid:a" }, jwk);
    assert.ok(!(await Model.verifyMessage(invalid)));
  });

  it("guards message with id", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Model.newMessage(did, ["urn:cid:a"], "Create", null, jwk);
    assert.ok(Model.isMessage(message));
    assert.ok(!Model.isMessage(omit(message, "@context")));
    assert.ok(!Model.isMessage(omit(message, "id")));
    assert.ok(!Model.isMessage(omit(message, "type")));
    assert.ok(!Model.isMessage(omit(message, "actor")));
    assert.ok(!Model.isMessage(omit(message, "object")));
    assert.ok(!Model.isMessage(omit(message, "published")));
  });

  it("gets message audiences", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Model.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: ["a:b/followers"],
      cc: ["a:c/followers", "a:d/followers"],
      audience: ["a:e/followers"],
    });
    const audiences = new Set(Model.getAudiences(message));
    assert.deepEqual(
      audiences,
      new Set(["a:b/followers", "a:c/followers", "a:d/followers", "a:e/followers"])
    );
  });
});
