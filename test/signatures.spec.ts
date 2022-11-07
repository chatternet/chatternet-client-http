import { didFromKey, newKey } from "../src/didkey.js";
import * as Credentials from "../src/signatures.js";
import assert from "assert";

describe("credentials", () => {
  it("builds same CID for same doc", async () => {
    const doc1 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      content: "abc",
    };
    const doc2 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      "https://www.w3.org/ns/activitystreams#content": "abc",
    };
    const id1 = await Credentials.buildDocCid(doc1);
    const id2 = await Credentials.buildDocCid(doc2);
    assert.ok(id1.equals(id2));
  });

  it("builds different CID for different documents", async () => {
    const doc1 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      content: "abc",
    };
    const doc2 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      content: "abcd",
    };
    const id1 = await Credentials.buildDocCid(doc1);
    const id2 = await Credentials.buildDocCid(doc2);
    assert.ok(!id1.equals(id2));
  });

  it("signs and verifies a document", async () => {
    const key = await newKey();
    const did = didFromKey(key);
    const doc = {
      "@context": [
        "https://www.w3.org/ns/activitystreams",
        "https://www.w3.org/2018/credentials/v1",
      ],
      content: "abc",
    };
    const signed = await Credentials.sign(doc, key);
    const verified = await Credentials.verify(signed, did);
    assert.ok(verified);
  });

  it("doesnt verify modified document", async () => {
    const key = await newKey();
    const did = didFromKey(key);
    const doc = {
      "@context": [
        "https://www.w3.org/ns/activitystreams",
        "https://www.w3.org/2018/credentials/v1",
      ],
      content: "abc",
    };
    const signed = await Credentials.sign(doc, key);
    signed.content = "abcd";
    const verified = await Credentials.verify(signed, did);
    assert.ok(!verified);
  });

  it("doesnt sign arbitrary data", async () => {
    const key = await newKey();
    const doc = {
      "@context": [
        "https://www.w3.org/ns/activitystreams",
        "https://www.w3.org/2018/credentials/v1",
      ],
      content: "abc",
      "invalid key": "abc",
    };
    assert.rejects(Credentials.sign(doc, key));
  });
});
