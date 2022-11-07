import { Ed25519VerificationKey2020 } from "@digitalbazaar/ed25519-verification-key-2020";
import type { LDKeyPair } from "crypto-ld";

// Protocols:
// https://www.w3.org/TR/did-core/
// https://w3c-ccg.github.io/did-method-key/
// https://github.com/multiformats/multicodec

// Digital Bazaaar implementations:
// https://github.com/digitalbazaar/did-method-key
// https://github.com/digitalbazaar/crypto-ld
// https://github.com/digitalbazaar/ed25519-verification-key-2020

export async function newKey(): Promise<Ed25519VerificationKey2020> {
  const key = await Ed25519VerificationKey2020.generate();
  const did = didFromKey(key);
  const fingerprint = fingerprintFromDid(did);
  key.id = `${did}#${fingerprint}`;
  key.controller = did;
  return key;
}

export function fingerprintFromDid(did: string): string {
  if (!did.startsWith("did:key:")) throw Error("invalid did");
  return did.slice("did:key:".length);
}

export function didFromFingerprint(fingerprint: string): string {
  return `did:key:${fingerprint}`;
}

export function keyFromDid(did: string): Ed25519VerificationKey2020 {
  const fingerprint = fingerprintFromDid(did);
  const key = Ed25519VerificationKey2020.fromFingerprint({ fingerprint });
  key.id = `${did}#${fingerprint}`;
  key.controller = did;
  return key;
}

export function didFromKey(key: LDKeyPair): string {
  return didFromFingerprint(key.fingerprint());
}

export type Verifier = (data: Uint8Array, signature: Uint8Array) => Promise<boolean>;

export function verifierFromKey(key: LDKeyPair): Verifier {
  const { verify } = key.verifier();
  return async (data, signature) => verify({ data, signature });
}

export type Signer = (data: Uint8Array) => Promise<Buffer>;

export function signerFromKey(key: LDKeyPair): Signer {
  const { sign } = key.signer();
  return async (data) => sign({ data });
}
