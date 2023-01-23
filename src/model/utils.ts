import type { Proof } from "../signatures.js";
import { get, has } from "lodash-es";

const MAX_URI_BYTES = 2048;

export interface WithId {
  id: string;
}
export function isWithId(x: unknown): x is WithId {
  if (!has(x, "id")) return false;
  return true;
}

export interface WithProof {
  proof: Proof;
}

export type Uri = string;
export function isUri(x: unknown): x is Uri {
  if (typeof x !== "string") return false;
  if (x.length > MAX_URI_BYTES) return false;
  if (!x.includes(":")) return false;
  return true;
}

export type ContextActivityStream = "https://www.w3.org/ns/activitystreams";
export type ContextSignature = "https://w3id.org/security/suites/ed25519-2020/v1";
export type ContextStream = [ContextActivityStream];
export const CONTEXT_STREAM: ContextStream = ["https://www.w3.org/ns/activitystreams"];
export function isContextStream(x: unknown): x is ContextSigStream {
  if (get(x, "length") != 1) return false;
  if (get(x, 0) !== CONTEXT_STREAM[0]) return false;
  return true;
}
export type ContextSigStream = [ContextSignature, ContextActivityStream];
export const CONTEXT_SIG_STREAM: ContextSigStream = [
  "https://w3id.org/security/suites/ed25519-2020/v1",
  "https://www.w3.org/ns/activitystreams",
];
export function isContextSigStream(x: unknown): x is ContextSigStream {
  if (get(x, "length") != 2) return false;
  if (get(x, 0) !== CONTEXT_SIG_STREAM[0]) return false;
  if (get(x, 1) !== CONTEXT_SIG_STREAM[1]) return false;
  return true;
}

export function isIterable(x: unknown): x is Iterable<unknown> {
  if (x == null) return false;
  if (typeof x !== "object") return false;
  return Symbol.iterator in x;
}
