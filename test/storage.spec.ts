import { DidKey, Model } from "../src/index.js";
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
      await db.idName.put({ id: "did:example:a", name: "name 1", timestamp: 0 });
      assert.equal((await db.idName.get("did:example:a"))?.name, "name 1");
      await db.idName.put({ id: "did:example:b", name: "name 2", timestamp: 0 });
      assert.equal((await db.idName.get("did:example:b"))?.name, "name 2");
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

    it("puts gets deletes follow", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      await db.follow.put("did:example:a");
      await db.follow.put("did:example:a");
      await db.follow.put("did:example:b");
      await db.follow.put("did:example:c");
      await db.follow.delete("did:example:b");
      assert.deepEqual(await db.follow.getAll(), ["did:example:a", "did:example:c"]);
    });

    it("puts gets deletes message ids", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      await db.message.put("id:a");
      await db.message.put("id:b");
      await db.message.put("id:c");
      let out1 = await db.message.getPage(undefined, 2);
      assert.deepEqual(out1.ids, ["id:c", "id:b"]);
      let out2 = await db.message.getPage(out1.nextStartIdx, 2);
      assert.deepEqual(out2.ids, ["id:a"]);
      let out3 = await db.message.getPage(out2.nextStartIdx, 2);
      assert.deepEqual(out3.ids, []);
      assert.equal(out3.nextStartIdx, null);
      await db.message.delete("id:c");
      await db.message.delete("id:d");
      let out4 = await db.message.getPage(undefined, 2);
      assert.deepEqual(out4.ids, ["id:b", "id:a"]);
    });

    it("puts gets deletes object doc", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      const doc1 = await Model.newNoteMd1k("abc", "did:example:a");
      const doc2 = await Model.newNoteMd1k("abcd", "did:example:a");
      await db.document.put(doc1);
      await db.document.put(doc2);
      await db.document.put(doc2);
      assert.deepEqual(await db.document.get(doc1.id), doc1);
      assert.deepEqual(await db.document.get(doc2.id), doc2);
      await db.document.delete(doc1.id);
      assert.ok(!(await db.document.get(doc1.id)));
    });

    it("puts gets has deletes message body", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      await db.messageDocument.put("id:m1", "id:b1");
      await db.messageDocument.put("id:m2", "id:b1");
      await db.messageDocument.put("id:m3", "id:b2");
      await db.messageDocument.put("id:m3", "id:b3");
      assert.ok(await db.messageDocument.hasMessageWithDocument("id:b1"));
      assert.ok(await db.messageDocument.hasMessageWithDocument("id:b2"));
      assert.ok(await db.messageDocument.hasMessageWithDocument("id:b3"));
      assert.ok(!(await db.messageDocument.hasMessageWithDocument("id:b4")));
      assert.deepEqual(await db.messageDocument.getDocumentsForMessage("id:m3"), [
        "id:b2",
        "id:b3",
      ]);
      await db.messageDocument.delete("id:m1", "id:b1");
      assert.ok(await db.messageDocument.hasMessageWithDocument("id:b1"));
      await db.messageDocument.delete("id:m2", "id:b1");
      assert.ok(!(await db.messageDocument.hasMessageWithDocument("id:b1")));
      await db.messageDocument.deleteForMessage("id:m3");
      assert.ok(!(await db.messageDocument.hasMessageWithDocument("id:b2")));
      assert.ok(!(await db.messageDocument.hasMessageWithDocument("id:b3")));
    });

    it("puts and gets view message", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      const key = await DidKey.newKey();
      const did = DidKey.didFromKey(key);
      const view1 = await Model.newMessage(did, ["id:a"], "View", null, key);
      const view2 = await Model.newMessage(did, ["id:b"], "View", null, key);
      await db.viewMessage.put(view1);
      await db.viewMessage.put(view2);
      assert.deepEqual(await db.viewMessage.get("id:a"), view1);
      assert.deepEqual(await db.viewMessage.get("id:b"), view2);
      // overrides
      const view3 = await Model.newMessage(did, ["id:a"], "View", null, key);
      await db.viewMessage.put(view3);
      assert.deepEqual(await db.viewMessage.get("id:a"), view3);
    });

    it("puts has deleted ID", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();
      db.deleted.put("id:a");
      db.deleted.put("id:b");
      assert.ok(await db.deleted.hasId("id:a"));
      assert.ok(await db.deleted.hasId("id:b"));
      assert.ok(!(await db.deleted.hasId("id:c")));
    });

    it("puts, updates, gets name", async () => {
      const db = await Storage.DbPeer.new();
      await db.clear();

      // puts and overwrites regardless of timestamp
      await db.idName.put({ id: "did:example:a", name: "name 1", timestamp: 10 });
      assert.equal((await db.idName.get("did:example:a"))?.name, "name 1");
      await db.idName.put({ id: "did:example:a", name: "name 1a", timestamp: 9 });
      assert.equal((await db.idName.get("did:example:a"))?.name, "name 1a");

      // puts and updates if newer
      await db.idName.putIfNewer({ id: "did:example:b", name: "name 2", timestamp: 10 });
      assert.equal((await db.idName.get("did:example:b"))?.name, "name 2");
      await db.idName.putIfNewer({ id: "did:example:b", name: "name 2a", timestamp: 11 });
      assert.equal((await db.idName.get("did:example:b"))?.name, "name 2a");
      await db.idName.putIfNewer({ id: "did:example:b", name: "name 2b", timestamp: 10 });
      assert.equal((await db.idName.get("did:example:b"))?.name, "name 2a");

      // doesn't update because not yet known
      await db.idName.updateIfNewer({ id: "did:example:c", name: "name 3", timestamp: 10 });
      assert.ok(!(await db.idName.get("did:example:c")));
    });
  });
});
