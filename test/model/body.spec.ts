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
    };
    assert.ok(Model.isNote1k(objectDoc));
    assert.ok(!Model.isNote1k(omit(objectDoc, "@context")));
    assert.ok(!Model.isNote1k(omit(objectDoc, "id")));
    assert.ok(!Model.isNote1k(omit(objectDoc, "type")));
    assert.ok(!Model.isNote1k(omit(objectDoc, "content")));
  });

  it("builds and verifies a note", async () => {
    const objectDoc = await Model.newNote1k("abc", {
      mediaType: "text/html",
      attributedTo: "did:example:a",
      inReplyTo: "urn:cid:a",
    });
    assert.ok(await Model.verifyNote1k(objectDoc));
  });

  it("doesnt build a note with content too long", async () => {
    assert.rejects(async () => await Model.newNote1k("a".repeat(1024 + 1)));
  });

  it("doesnt verify a note with invalid content", async () => {
    const objectDoc = await Model.newNote1k("abc");
    objectDoc.content = "abcd";
    assert.ok(!(await Model.verifyNote1k(objectDoc)));
  });
});
