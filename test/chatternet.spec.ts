import { ChatterNet, DidKey } from "../src/index.js";
import * as assert from "assert";
import "fake-indexeddb/auto";
import "mock-local-storage";

// @ts-ignore
global.window = {
  crypto: globalThis.crypto,
  localStorage: global.localStorage,
};

describe("chatter net", () => {
  const defaultServers = process.env.CHATTERNET_TEST_SERVER
    ? [process.env.CHATTERNET_TEST_SERVER]
    : [];

  it("builds new from did and password", async () => {
    await ChatterNet.clearDbs();
    const key = await DidKey.newKey();
    const did = await ChatterNet.newAccount(key, "some name", "abc");
    await ChatterNet.new(did, "abc", 2, defaultServers);
  });

  it("doesnt build for wrong password", async () => {
    await ChatterNet.clearDbs();
    const key = await DidKey.newKey();
    const did = await ChatterNet.newAccount(key, "some name", "abc");
    assert.rejects(() => ChatterNet.new(did, "abcd", 2, []));
  });
});
