import { Model } from "../../src/index.js";
import { CONTEXT_STREAM } from "../../src/model/utils.js";
import * as assert from "assert";
import { omit } from "lodash-es";

describe("model body", () => {
  it("guards note", async () => {
    const objectDoc = {
      "@context": CONTEXT_STREAM,
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

  it("guards tag", async () => {
    const objectDoc = {
      "@context": CONTEXT_STREAM,
      id: "a:b",
      type: "Object",
      name: "abcd",
    };
    assert.ok(Model.isTag30(objectDoc));
    assert.ok(!Model.isTag30(omit(objectDoc, "@context")));
    assert.ok(!Model.isTag30(omit(objectDoc, "id")));
    assert.ok(!Model.isTag30(omit(objectDoc, "type")));
    assert.ok(!Model.isTag30(omit(objectDoc, "name")));
  });

  it("builds and verifies a tag", async () => {
    const objectDoc = await Model.newTag30("abc");
    assert.ok(await Model.verifyTag30(objectDoc));
  });

  it("doesnt build a tag with name too long", async () => {
    assert.rejects(async () => await Model.newTag30("a".repeat(30 + 1)));
  });

  it("doesnt verify a tag with invalid content", async () => {
    const objectDoc = await Model.newTag30("abc");
    objectDoc.name = "abcd";
    assert.ok(!(await Model.verifyTag30(objectDoc)));
  });
});
