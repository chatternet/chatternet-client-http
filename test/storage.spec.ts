import { DidKey, Messages } from "../src/index.js";
import * as Storage from "../src/storage.js";
import * as assert from "assert";
import "fake-indexeddb/auto";

// @ts-ignore
if (!global.window) global.window = { crypto: globalThis.crypto };

describe("storage", () => {
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

      const key1 = await DidKey.newKey();
      const did1 = DidKey.didFromKey(key1);
      const salt1 = await db.idSalt.getPut(did1);
      const cryptoKey1 = await Storage.cryptoKeyFromPassword("abc", salt1);
      await db.keyPair.put(key1, cryptoKey1);

      const key2 = await DidKey.newKey();
      const did2 = DidKey.didFromKey(key2);
      const salt2 = await db.idSalt.getPut(did1);
      const cryptoKey2 = await Storage.cryptoKeyFromPassword("abcd", salt2);
      await db.keyPair.put(key2, cryptoKey2);

      const back1 = await db.keyPair.get(did1, cryptoKey1);
      assert.ok(back1);
      assert.deepEqual(back1.fingerprint(), key1.fingerprint());

      assert.deepEqual(new Set([...(await db.keyPair.getDids())]), new Set([did1, did2]));
    });

    it("puts and gets name", async () => {
      const db = await Storage.DbDevice.new();
      await db.clear();
      await db.idName.put("did:example:a", "name 1");
      assert.deepEqual(await db.idName.get("did:example:a"), {
        id: "did:example:a",
        name: "name 1",
      });
      await db.idName.put("did:example:b", "name 2");
      assert.deepEqual(await db.idName.get("did:example:b"), {
        id: "did:example:b",
        name: "name 2",
      });
    });
  });

  describe("db peer", () => {
    it("puts and gets servers", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      await db.server.update({
        info: { url: "https://a.example.com", did: "did:example:a" },
        lastListenTimestamp: 0,
      });
      // update
      await db.server.update({
        info: { url: "https://a.example.com", did: "did:example:a" },
        lastListenTimestamp: 0,
      });
      await db.server.update({
        info: { url: "https://a.example.com", did: "did:example:a" },
        lastListenTimestamp: 1,
      });
      await db.server.update({
        info: { url: "https://b.example.com", did: "did:example:a" },
        lastListenTimestamp: 0,
      });
      await db.server.update({
        info: { url: "https://c.example.com", did: "did:example:c" },
        lastListenTimestamp: 2,
      });
      assert.deepEqual(await db.server.getByLastListen(2), [
        { url: "https://c.example.com", did: "did:example:c" },
        { url: "https://a.example.com", did: "did:example:a" },
      ]);
    });

    it("puts and gets follow", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      await db.follow.put("did:example:a");
      await db.follow.put("did:example:a");
      await db.follow.put("did:example:b");
      assert.deepEqual(await db.follow.getAll(), ["did:example:a", "did:example:b"]);
    });

    it("puts and gets message ids", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      await db.message.put("id:a");
      await db.message.put("id:b");
      await db.message.put("id:c");
      assert.deepEqual(await db.message.getPage(undefined, 3), ["id:c", "id:b", "id:a"]);
      assert.deepEqual(await db.message.getPage(undefined, 2), ["id:c", "id:b"]);
    });

    it("gets message ids after", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      await db.message.put("id:a");
      await db.message.put("id:b");
      await db.message.put("id:c");
      assert.deepEqual(await db.message.getPage("id:c", 3), ["id:b", "id:a"]);
      assert.deepEqual(await db.message.getPage("id:b", 3), ["id:a"]);
      assert.deepEqual(await db.message.getPage("id:a", 3), []);
      assert.deepEqual(await db.message.getPage("id:x", 3), []);
    });

    it("puts and gets object doc", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      const objectDoc1 = await Messages.newObjectDoc("Note", { content: "abc" });
      const objectDoc2 = await Messages.newObjectDoc("Note", { content: "abcd" });
      await db.objectDoc.put(objectDoc1);
      await db.objectDoc.put(objectDoc2);
      await db.objectDoc.put(objectDoc2);
      assert.deepEqual(await db.objectDoc.get(objectDoc1.id), objectDoc1);
      assert.deepEqual(await db.objectDoc.get(objectDoc2.id), objectDoc2);
    });
  });
});
