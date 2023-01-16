import type { WithProof } from "../signatures.js";
import { DateTime, Key, isDateTime, sign, verify } from "../signatures.js";
import { getIsoDate } from "../utils.js";
import { CONTEXT, Context, Uri, isContext, isUri } from "./utils.js";
import { get, has } from "lodash-es";

const MAX_NAME_CHARS = 30;

export interface ActorNoProof {
  "@context": Context;
  id: Uri;
  type: string;
  published: DateTime;
  name?: string;
  url?: string;
}

export type Actor = ActorNoProof & WithProof;

export interface ActorOptions {
  name?: string;
  url?: string;
}

export async function newActor(
  did: Uri,
  type: string,
  key: Key,
  options: ActorOptions = {}
): Promise<Actor> {
  const id = `${did}/actor`;
  const actor: ActorNoProof = {
    "@context": CONTEXT,
    id,
    type,
    published: getIsoDate(),
    ...options,
  };
  return await sign(actor, key);
}

export function didFromActorId(actorId: string): string | undefined {
  const [did, path] = actorId.split("/", 2);
  if (path != "actor") return undefined;
  if (!did.startsWith("did:")) return undefined;
  return did;
}

export function isActor(x: unknown): x is Actor {
  if (!isContext(get(x, "@context"))) return false;
  if (!isUri(get(x, "id"))) return false;
  if (!has(x, "type")) return false;
  if (!isDateTime(get(x, "published"))) return false;
  const name: unknown = get(x, "name");
  if (name != null && (typeof name !== "string" || name.split("").length > MAX_NAME_CHARS))
    return false;
  return true;
}

export async function verifyActor(actor: Actor): Promise<boolean> {
  const did = didFromActorId(actor.id);
  if (!did) return false;
  if (!(await verify(actor, did))) return false;
  return true;
}
