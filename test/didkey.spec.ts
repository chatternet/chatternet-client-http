import { DidKey } from "../src/index.js";
import * as assert from "assert";

describe("did key", () => {
  const did = "did:key:z6MkqesEr2GVFXc3qWZi9PzMqtvMMyR5gB3P3R5GTsB7YTRC";

  it("does not build fingerprint from invalid did", () => {
    assert.throws(() => DidKey.fingerprintFromDid("a:b"));
  });

  it("builds fingerprint in a roundtrip", () => {
    assert.equal(DidKey.didFromFingerprint(DidKey.fingerprintFromDid(did)), did);
  });

  it("builds peer ID and did in a roundtrip", async () => {
    const key = DidKey.keyFromDid(did);
    const didBack = DidKey.didFromKey(key);
    assert.equal(didBack, did);
  });

  it("does not build key from invalid did", async () => {
    assert.throws(() => DidKey.keyFromDid("a:b"));
  });

  it("signs and verifies with private key from peer id", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const key = await DidKey.newKey();
    const signer = DidKey.signerFromKey(key);
    const verifier = DidKey.verifierFromKey(key);
    const signature = await signer(data);
    assert.ok(await verifier(data, signature));
    assert.ok(!(await verifier(new Uint8Array([]), signature)));
  });
});
