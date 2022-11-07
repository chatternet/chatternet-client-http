import { keyFromDid } from "./didkey.js";
import { contexts } from "./ldcontexts/index.js";
import { DidKeyDriver } from "@digitalbazaar/did-method-key";
import { Ed25519Signature2020 } from "@digitalbazaar/ed25519-signature-2020";
import type { Ed25519VerificationKey2020 } from "@digitalbazaar/ed25519-verification-key-2020";
import jsonld from "jsonld";
import jsigs from "jsonld-signatures";
import { get } from "lodash-es";
import { CID } from "multiformats";
import * as json from "multiformats/codecs/json";
import type { MultihashDigest } from "multiformats/hashes/interface.js";
import { sha256 } from "multiformats/hashes/sha2";

export type Key = Ed25519VerificationKey2020;

export type Uri = string;
export function isUri(x: unknown): x is Uri {
  if (typeof x !== "string") return false;
  try {
    new URL(x);
    return true;
  } catch {
    return false;
  }
}

export type DateTime = string;
export function isDateTime(x: unknown): x is Uri {
  if (typeof x !== "string") return false;
  let date1 = new Date(x);
  let date2 = new Date(date1.toISOString());
  return date1 === date2;
}

export interface Proof {
  type: string;
  created: DateTime;
  verificationMethod: Uri;
  proofPurpose: string;
  proofValue: string;
}

export function buildDocumentLoader(urlToDocument?: {
  [url: string]: object;
}): (url: string) => { document: object } {
  return (url: string) => {
    let document = undefined;
    if (urlToDocument) document = get(urlToDocument, url);
    if (!document) document = get(contexts, url);
    if (!document) throw Error(`document contains an unknown url: ${url}`);
    return { document };
  };
}

async function canonize(doc: object): Promise<string> {
  const documentLoader = buildDocumentLoader();
  return jsonld.canonize(doc, {
    algorithm: "URDNA2015",
    format: "application/n-quads",
    documentLoader,
  });
}

async function buildDigest(doc: object): Promise<MultihashDigest> {
  const canonized = await canonize(doc);
  if (!canonized) throw Error("unable to build digest");
  const bytes = new TextEncoder().encode(canonized);
  return await sha256.digest(bytes);
}

export async function buildDocCid(doc: object): Promise<CID> {
  return CID.createV1(json.code, await buildDigest(doc));
}

export interface WithProof {
  proof: Proof;
}

export async function sign<T>(document: T, key: Key): Promise<T & WithProof> {
  const suite = new Ed25519Signature2020({ key });
  const documentLoader = buildDocumentLoader();
  const purpose = new jsigs.purposes.AssertionProofPurpose();
  return await jsigs.sign(document, { suite, purpose, documentLoader });
}

export async function verify(document: object, did: string): Promise<boolean> {
  const key = keyFromDid(did);
  const suite = new Ed25519Signature2020({ key });
  const didDocument = await new DidKeyDriver().get({ did, url: undefined });
  const documentLoader = buildDocumentLoader({ [did]: didDocument });
  const purpose = new jsigs.purposes.AssertionProofPurpose();
  const { verified } = await jsigs.verify(document, { suite, purpose, documentLoader });
  return verified;
}
