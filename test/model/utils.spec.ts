import { isUri } from "../../src/model/utils.js";
import * as assert from "assert";

describe("model utils", () => {
  it("guards URI", () => {
    assert.ok(!isUri("a"));
    assert.ok(isUri("a:"));
    assert.ok(isUri("a:b"));
    assert.ok(isUri("a:" + "b".repeat(2048 - 2)));
    assert.ok(!isUri("a:" + "b".repeat(2048 - 1)));
  });
});
