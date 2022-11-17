import { DidKey, Messages } from "../src/index.js";
import { isActor, isMessageWithId, isObjectDocWithId } from "../src/messages.js";
import { sign } from "../src/signatures.js";
import * as assert from "assert";
import { omit } from "lodash-es";

describe("messages", () => {
  const did = "did:key:z6MkqesEr2GVFXc3qWZi9PzMqtvMMyR5gB3P3R5GTsB7YTRC";

  it("builds did from actor id", async () => {
    const actorId = `${did}/actor`;
    const didBack = Messages.didFromActorId(actorId);
    assert.equal(did, didBack);
  });

  it("doesnt build did from invalid actor id", async () => {
    assert.ok(!Messages.didFromActorId(`${did}/other`));
    assert.ok(!Messages.didFromActorId(`${did}`));
    assert.ok(!Messages.didFromActorId(`a:b/actor`));
  });

  it("guards object doc with id", async () => {
    const objectDoc = {
      "@context": ["a:b"],
      id: "a:b",
      type: "abc",
    };
    assert.ok(isObjectDocWithId(objectDoc));
    assert.ok(!isObjectDocWithId(omit(objectDoc, "@context")));
    assert.ok(!isObjectDocWithId(omit(objectDoc, "id")));
    assert.ok(!isObjectDocWithId(omit(objectDoc, "type")));
  });

  it("builds and verifies an object with invalid ID", async () => {
    const objectDoc = await Messages.newObjectDoc("Note", {
      content: "abc",
    });
    objectDoc.content = "abcd";
    assert.ok(!(await Messages.verifyObjectDoc(objectDoc)));
  });

  it("builds an inbox", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Messages.newMessage(did, ["urn:cid:a"], "Create", null, jwk);
    const inbox = Messages.newInbox("did:example:a/actor", [message], "urn:cid:a");
    assert.equal(inbox.id, "did:example:a/actor/inbox?after=urn:cid:a");
    assert.equal(inbox.orderedItems[0].id, message.id);
  });

  it("builds and verifies an actor", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const actor = await Messages.newActor(did, "Person", jwk, { name: "abc" });
    assert.ok(await Messages.verifyActor(actor));
    assert.ok(actor.id.startsWith(did));
    assert.equal(actor.name, "abc");
  });

  it("guards actor", async () => {
    const actor = {
      "@context": ["a:b"],
      id: "a:b",
      type: "Actor",
      inbox: "abc",
      outbox: "abc",
      followers: "abc",
      following: "abc",
    };
    assert.ok(isActor(actor));
    assert.ok(!isActor(omit(actor, "@context")));
    assert.ok(!isActor(omit(actor, "id")));
    assert.ok(!isActor(omit(actor, "type")));
    assert.ok(!isActor(omit(actor, "inbox")));
    assert.ok(!isActor(omit(actor, "outbox")));
    assert.ok(!isActor(omit(actor, "followers")));
    assert.ok(!isActor(omit(actor, "following")));
  });

  it("doesnt verify invalid actor", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const actor = await Messages.newActor(did, "Person", jwk, { name: "abc" });
    assert.ok(!(await Messages.verifyActor({ ...actor, name: "abcd" })));
    assert.ok(
      !(await Messages.verifyActor(await sign({ ...omit(actor, "proof"), inbox: "a:b" }, jwk)))
    );
    assert.ok(
      !(await Messages.verifyActor(await sign({ ...omit(actor, "proof"), outbox: "a:b" }, jwk)))
    );
    assert.ok(
      !(await Messages.verifyActor(await sign({ ...omit(actor, "proof"), following: "a:b" }, jwk)))
    );
    assert.ok(
      !(await Messages.verifyActor(await sign({ ...omit(actor, "proof"), followers: "a:b" }, jwk)))
    );
  });

  it("builds and verifies a message", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Messages.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: "did:example:a",
    });
    assert.ok(await Messages.verifyMessage(message));
    assert.ok(message.actor.startsWith(did));
    assert.equal(message.object, "urn:cid:a");
    assert.equal(message.to, "did:example:a");
  });

  it("doesnt verify modified message", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Messages.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: "did:example:a",
    });
    message.to = "did:example:b";
    assert.ok(!(await Messages.verifyMessage(message)));
  });

  it("doesnt verify message with invalid ID", async () => {
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const message = await Messages.newMessage(did, ["urn:cid:a"], "Create", null, jwk, {
      to: "did:example:a",
    });
    let invalid = await sign({ ...omit(message, "proof"), id: "urn:cid:a" }, jwk);
    assert.ok(!(await Messages.verifyMessage(invalid)));
  });

  it("guards message with id", async () => {
    const message = {
      "@context": ["a:b"],
      id: "a:b",
      type: "abc",
      actor: "a:b",
      object: ["a:b"],
      published: "2000-01-01T00:00:00Z",
    };
    assert.ok(isMessageWithId(message));
    assert.ok(!isMessageWithId(omit(message, "@context")));
    assert.ok(!isMessageWithId(omit(message, "id")));
    assert.ok(!isMessageWithId(omit(message, "type")));
    assert.ok(!isMessageWithId(omit(message, "actor")));
    assert.ok(!isMessageWithId(omit(message, "object")));
    assert.ok(!isMessageWithId(omit(message, "published")));
  });
});
