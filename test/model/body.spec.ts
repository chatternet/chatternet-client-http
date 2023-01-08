import { Model } from "../../src/index.js";
import { CONTEXT } from "../../src/model/utils.js";
import * as assert from "assert";
import { omit } from "lodash-es";

describe("model body", () => {
  it("guards body", async () => {
    const objectDoc = {
      "@context": CONTEXT,
      id: "a:b",
      type: "abc",
    };
    assert.ok(Model.isBody(objectDoc));
    assert.ok(!Model.isBody(omit(objectDoc, "@context")));
    assert.ok(!Model.isBody(omit(objectDoc, "id")));
    assert.ok(!Model.isBody(omit(objectDoc, "type")));
  });

  it("builds and verifies a body", async () => {
    const objectDoc = await Model.newBody("Note", {
      content: "abc",
      mediaType: "text/html",
      inReplyTo: "urn:cid:a",
    });
    assert.ok(await Model.verifyBody(objectDoc));
  });

  it("doesnt verify a body with invalid content", async () => {
    const objectDoc = await Model.newBody("Note", {
      content: "abc",
    });
    objectDoc.content = "abcd";
    assert.ok(!(await Model.verifyBody(objectDoc)));
  });
});
