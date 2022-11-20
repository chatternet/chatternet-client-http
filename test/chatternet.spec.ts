import { ChatterNet, DidKey } from "../src/index.js";
import type { ServerInfo } from "../src/storage.js";
import * as assert from "assert";
import "fake-indexeddb/auto";
import "mock-local-storage";

// @ts-ignore
global.window = {
  crypto: globalThis.crypto,
  localStorage: global.localStorage,
};

describe("chatter net", () => {
  const defaultServers: ServerInfo[] = process.env.CHATTERNET_TEST_SERVER
    ? [JSON.parse(process.env.CHATTERNET_TEST_SERVER)]
    : [];

  it("builds new from did and password and gets name", async () => {
    await ChatterNet.clearDbs();
    const key = await DidKey.newKey();
    const did = await ChatterNet.newAccount(key, "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    assert.equal(chatterNet.getName(), "some name");
  });

  it("doesnt build for wrong password", async () => {
    await ChatterNet.clearDbs();
    const key = await DidKey.newKey();
    const did = await ChatterNet.newAccount(key, "some name", "abc");
    assert.rejects(() => ChatterNet.new(did, "abcd", []));
  });

  it("changes name and builds with new name", async () => {
    await ChatterNet.clearDbs();
    const key = await DidKey.newKey();
    const did = await ChatterNet.newAccount(key, "some name", "abc");
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      chatterNet.changeName("some other name");
      assert.equal(chatterNet.getName(), "some other name");
    }
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      assert.equal(chatterNet.getName(), "some other name");
    }
  });

  it("changes password and builds with new password", async () => {
    await ChatterNet.clearDbs();
    const key = await DidKey.newKey();
    const did = await ChatterNet.newAccount(key, "some name", "abc");
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      assert.ok(await chatterNet.changePassword("abc", "abcd"));
    }
    {
      await ChatterNet.new(did, "abcd", defaultServers);
    }
  });

  it("doesnt change password with wrong password", async () => {
    await ChatterNet.clearDbs();
    const key = await DidKey.newKey();
    const did = await ChatterNet.newAccount(key, "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    assert.ok(!(await chatterNet.changePassword("abcd", "abcd")));
  });
});
