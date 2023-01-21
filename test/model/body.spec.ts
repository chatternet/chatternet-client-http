import { Model } from "../../src/index.js";
import { CONTEXT } from "../../src/model/utils.js";
import * as assert from "assert";
import { omit } from "lodash-es";

describe("model body", () => {
  it("guards body", async () => {
    const objectDoc = {
      "@context": CONTEXT,
      id: "a:b",
      type: "Note",
      content: "abcd",
      mediaType: "text/markdown",
      attributedTo: "did:example:a",
    };
    assert.ok(Model.isNoteMd1k(objectDoc));
    assert.ok(!Model.isNoteMd1k(omit(objectDoc, "@context")));
    assert.ok(!Model.isNoteMd1k(omit(objectDoc, "id")));
    assert.ok(!Model.isNoteMd1k(omit(objectDoc, "type")));
    assert.ok(!Model.isNoteMd1k(omit(objectDoc, "content")));
    assert.ok(!Model.isNoteMd1k(omit(objectDoc, "mediaType")));
    assert.ok(!Model.isNoteMd1k(omit(objectDoc, "attributedTo")));
  });

  it("builds and verifies a note", async () => {
    const objectDoc = await Model.newNoteMd1k("abc", "did:example:a", {
      inReplyTo: "urn:cid:a",
    });
    assert.ok(await Model.verifyNoteMd1k(objectDoc));
  });

  it("doesnt build a note with content too long", async () => {
    assert.rejects(async () => await Model.newNoteMd1k("a".repeat(1024 + 1), "did:example:a"));
  });

  it("doesnt verify a note with invalid content", async () => {
    const objectDoc = await Model.newNoteMd1k("abc", "did:example:a");
    objectDoc.content = "abcd";
    assert.ok(!(await Model.verifyNoteMd1k(objectDoc)));
  });
});
