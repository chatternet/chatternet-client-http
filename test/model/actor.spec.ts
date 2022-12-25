import { DidKey, Model } from "../../src/index.js";
import { didFromActorId } from "../../src/model/actor.js";
import * as assert from "assert";
import { omit } from "lodash-es";

describe("model actor", () => {
  const did = "did:key:z6MkqesEr2GVFXc3qWZi9PzMqtvMMyR5gB3P3R5GTsB7YTRC";

  it("builds did from actor id", () => {
    const actorId = `${did}/actor`;
    const didBack = didFromActorId(actorId);
    assert.equal(did, didBack);
  });

  it("doesnt build did from invalid actor id", () => {
    assert.ok(!didFromActorId(`${did}/other`));
    assert.ok(!didFromActorId(`${did}`));
    assert.ok(!didFromActorId(`a:b/actor`));
  });

  it("builds and verifies an actor", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const actor = await Model.newActor(did, "Person", jwk, {
      name: "abc",
    });
    assert.ok(await Model.verifyActor(actor));
    assert.ok(actor.id.startsWith(did));
    assert.equal(actor.name, "abc");
  });

  it("guards actor", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const actor = await Model.newActor(did, "Person", jwk, {
      name: "abc",
    });
    assert.ok(Model.isActor(actor));
    assert.ok(Model.isActor(omit(actor, "name")));
    assert.ok(Model.isActor(omit(actor, "url")));
    assert.ok(!Model.isActor(omit(actor, "@context")));
    assert.ok(!Model.isActor(omit(actor, "id")));
    assert.ok(!Model.isActor(omit(actor, "type")));
    assert.ok(!Model.isActor(omit(actor, "inbox")));
    assert.ok(!Model.isActor(omit(actor, "outbox")));
    assert.ok(!Model.isActor(omit(actor, "followers")));
    assert.ok(!Model.isActor(omit(actor, "following")));
  });

  it("doesnt verify invalid actor", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const actor = await Model.newActor(did, "Person", jwk, { name: "abc" });
    assert.ok(!(await Model.verifyActor({ ...actor, name: "abcd" })));
  });
});
