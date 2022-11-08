import * as Activities from "../src/activities.js";
import { didFromKey, newKey } from "../src/didkey.js";
import { sign } from "../src/signatures.js";
import assert from "assert";
import { omit } from "lodash-es";

describe("activities", () => {
  const did = "did:key:z6MkqesEr2GVFXc3qWZi9PzMqtvMMyR5gB3P3R5GTsB7YTRC";

  it("builds did from actor id", async () => {
    const actorId = `${did}/actor`;
    const didBack = Activities.didFromActorId(actorId);
    assert.equal(did, didBack);
  });

  it("doesnt build did from invalid actor id", async () => {
    assert.ok(!Activities.didFromActorId(`${did}/other`));
    assert.ok(!Activities.didFromActorId(`${did}`));
    assert.ok(!Activities.didFromActorId(`a:b/actor`));
  });

  it("builds and verifies an object with invalid ID", async () => {
    const objectDoc = await Activities.newObjectDoc("Note", {
      content: "abc",
    });
    objectDoc.content = "abcd";
    assert.ok(!(await Activities.verifyObjectDoc(objectDoc)));
  });

  it("builds an inbox", async () => {
    const jwk = await newKey();
    const did = didFromKey(jwk);
    const message = await Activities.newMessage(did, ["urn:cid:a"], "Create", null, jwk);
    const inbox = Activities.newInbox("did:example:a/actor", [message], "urn:cid:a");
    assert.equal(inbox.id, "did:example:a/actor/inbox?after=urn:cid:a");
    assert.equal(inbox.orderedItems[0].id, message.id);
  });

  it("builds and verifies an actor", async () => {
    const jwk = await newKey();
    const did = didFromKey(jwk);
    const actor = await Activities.newActor(did, "Person", jwk, { name: "abc" });
    assert.ok(await Activities.verifyActor(actor));
    assert.ok(actor.id.startsWith(did));
    assert.equal(actor.name, "abc");
  });

  it("doesnt verify invalid actor", async () => {
    const jwk = await newKey();
    const did = didFromKey(jwk);
    const actor = await Activities.newActor(did, "Person", jwk, { name: "abc" });
    assert.ok(!(await Activities.verifyActor({ ...actor, name: "abcd" })));
    assert.ok(
      !(await Activities.verifyActor(await sign({ ...omit(actor, "proof"), inbox: "a:b" }, jwk)))
    );
    assert.ok(
      !(await Activities.verifyActor(await sign({ ...omit(actor, "proof"), outbox: "a:b" }, jwk)))
    );
    assert.ok(
      !(await Activities.verifyActor(
        await sign({ ...omit(actor, "proof"), following: "a:b" }, jwk)
      ))
    );
    assert.ok(
      !(await Activities.verifyActor(
        await sign({ ...omit(actor, "proof"), followers: "a:b" }, jwk)
      ))
    );
  });

  it("builds and verifies a message", async () => {
    const jwk = await newKey();
    const did = didFromKey(jwk);
    const message = await Activities.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: "did:example:a",
    });
    assert.ok(await Activities.verifyMessage(message));
    assert.ok(message.actor.startsWith(did));
    assert.equal(message.object, "urn:cid:a");
    assert.equal(message.to, "did:example:a");
  });

  it("doesnt verify modified message", async () => {
    const jwk = await newKey();
    const did = didFromKey(jwk);
    const message = await Activities.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: "did:example:a",
    });
    message.to = "did:example:b";
    assert.ok(!(await Activities.verifyMessage(message)));
  });

  it("doesnt verify message with invalid ID", async () => {
    const jwk = await newKey();
    const did = didFromKey(jwk);
    const message = await Activities.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: "did:example:a",
    });
    let invalid = await sign({ ...omit(message, "proof"), id: "urn:cid:a" }, jwk);
    assert.ok(!(await Activities.verifyMessage(invalid)));
  });
});
