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
      const key = await DidKey.newKey();
      const did = DidKey.didFromKey(key);
      const password = "abc";
      const salt = await db.idSalt.getPut(did);
      const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
      await db.keyPair.put(key, cryptoKey);
      const back = await db.keyPair.get(did, cryptoKey);
      assert.ok(back);
      assert.deepEqual(back.fingerprint(), key.fingerprint());
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
