import * as Activities from "../src/activities.js";
import { didFromKey, newKey } from "../src/didkey.js";
import * as Storage from "../src/storage.js";
import assert from "assert";
import "fake-indexeddb/auto";

// @ts-ignore
if (!global.window) global.window = { crypto: globalThis.crypto };

describe("storage", () => {
  it("builds suffix", () => {
    assert.equal(Storage.buildSuffix("abc", []), "");
    assert.equal(Storage.buildSuffix("abc", [], 1), "a");
    assert.equal(Storage.buildSuffix("abc", [], 2), "ab");
    assert.equal(Storage.buildSuffix("abc", [""]), "a");
    assert.equal(Storage.buildSuffix("abc", ["", "a"]), "ab");
    assert.equal(Storage.buildSuffix("abc", ["", "a", "ab"]), "abc");
    assert.equal(Storage.buildSuffix("abc", ["", "a", "ab", "abc"]), "abc");
  });

  describe("db device", () => {
    it("puts and gets id salt", async () => {
      const db = await Storage.DbDevice.new();
      await db.clear();
      const salt = await db.idSalt.getPut("did:example:a");
      assert.deepEqual(await db.idSalt.getPut("did:example:a"), salt);
      assert.notDeepEqual(await db.idSalt.getPut("did:example:b"), salt);
    });

    it("puts and gets key pair", async () => {
      const db = await Storage.DbDevice.new();
      await db.clear();
      const key = await newKey();
      const did = didFromKey(key);
      const password = "abc";
      const salt = await db.idSalt.getPut(did);
      const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
      await db.keyPair.put(key, cryptoKey);
      const back = await db.keyPair.get(did, cryptoKey);
      assert.ok(back);
      assert.deepEqual(back.fingerprint(), key.fingerprint());
    });

    it("puts and gets name suffix", async () => {
      const db = await Storage.DbDevice.new();
      await db.clear();
      await db.nameSuffix.put("did:example:a", "name 1");
      assert.deepEqual(await db.nameSuffix.get("did:example:a"), { name: "name 1", suffix: "" });
      await db.nameSuffix.put("did:example:a", "name 1");
      assert.deepEqual(await db.nameSuffix.get("did:example:a"), { name: "name 1", suffix: "" });
      assert.ok(!(await db.nameSuffix.get("did:example:b")));
      await db.nameSuffix.put("did:example:b", "name 2");
      assert.deepEqual(await db.nameSuffix.get("did:example:a"), { name: "name 1", suffix: "" });
      assert.deepEqual(await db.nameSuffix.get("did:example:b"), { name: "name 2", suffix: "" });
      await db.nameSuffix.put("did:example:c", "name 2");
      assert.deepEqual(await db.nameSuffix.get("did:example:a"), { name: "name 1", suffix: "" });
      assert.deepEqual(await db.nameSuffix.get("did:example:b"), { name: "name 2", suffix: "" });
      assert.deepEqual(await db.nameSuffix.get("did:example:c"), { name: "name 2", suffix: "c" });
    });
  });

  describe("db peer", () => {
    it("puts and gets context", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      const jwk = await newKey();
      const did = didFromKey(jwk);
      const message1 = await Activities.newMessage(did, "urn:cid:a", "Create", null, jwk);
      const message2 = await Activities.newMessage(did, "urn:cid:b", "Create", null, jwk);
      await db.context.put(message1);
      await db.context.put(message2);
      assert.deepEqual(
        (await db.context.getAll()).map((x) => x.id),
        [message1.id, message2.id]
      );
    });

    it("puts and gets name suffix", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      await db.nameSuffix.put("did:example:a", "name 1");
      assert.deepEqual(await db.nameSuffix.get("did:example:a"), { name: "name 1", suffix: "" });
      await db.nameSuffix.put("did:example:a", "name 1");
      assert.deepEqual(await db.nameSuffix.get("did:example:a"), { name: "name 1", suffix: "" });
      assert.ok(!(await db.nameSuffix.get("did:example:b")));
      await db.nameSuffix.put("did:example:b", "name 2");
      assert.deepEqual(await db.nameSuffix.get("did:example:a"), { name: "name 1", suffix: "" });
      assert.deepEqual(await db.nameSuffix.get("did:example:b"), { name: "name 2", suffix: "" });
      await db.nameSuffix.put("did:example:c", "name 2");
      assert.deepEqual(await db.nameSuffix.get("did:example:a"), { name: "name 1", suffix: "" });
      assert.deepEqual(await db.nameSuffix.get("did:example:b"), { name: "name 2", suffix: "" });
      assert.deepEqual(await db.nameSuffix.get("did:example:c"), { name: "name 2", suffix: "c" });
    });

    it("puts and gets servers", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      await db.server.update({ url: "https://a.example.com", lastListenTimestamp: 0 });
      // update
      await db.server.update({
        url: "https://a.example.com",
        lastListenTimestamp: 0,
      });
      await db.server.update({
        url: "https://a.example.com",
        lastListenTimestamp: 1,
      });
      await db.server.update({ url: "https://b.example.com", lastListenTimestamp: 0 });
      await db.server.update({ url: "https://c.example.com", lastListenTimestamp: 2 });
      assert.deepEqual(await db.server.get("https://a.example.com"), {
        url: "https://a.example.com",
        lastListenTimestamp: 1,
      });
      assert.deepEqual(await db.server.getUrlsByLastListen(2), [
        "https://c.example.com",
        "https://a.example.com",
      ]);
    });
  });
});
