import { ChatterNet } from "../src/chatternet.js";
import { DbDevice, DbPeer } from "../src/storage.js";
import assert from "assert";
import "fake-indexeddb/auto";

// @ts-ignore
if (!global.window) global.window = { crypto: globalThis.crypto };

describe("chatter net", () => {
  async function clearDbs() {
    await (await DbDevice.new()).clear();
    await (await DbPeer.new()).clear();
  }

  it("creates new account", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount("some name", "abc");
    assert.ok(did);
  });

  it("builds new from did and password", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount("some name", "abc");
    await ChatterNet.new(did, "abc");
  });

  it("doesnt build for wrong password", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount("some name", "abc");
    assert.rejects(() => ChatterNet.new(did, "abcd"));
  });
});
