import { DidKey } from "../src/index.js";
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
  });
});
