import { WithProof, buildDocCid, isDateTime } from "../signatures.js";
import { DateTime, Key, sign, verify } from "../signatures.js";
import { getIsoDate } from "../utils.js";
import { didFromActorId } from "./actor.js";
import {
  CONTEXT_SIG_STREAM,
  ContextSigStream,
  Uri,
  WithId,
  isContextSigStream,
  isIterable,
  isUri,
} from "./utils.js";
import { get, has, isEqual, omit } from "lodash-es";
import { CID } from "multiformats";

const MAX_MESSAGE_URIS = 256;

function isUris(uris: unknown): uris is Uri[] {
  if (!isIterable(uris)) return false;
  let count = 0;
  for (const uri of uris) {
    count += 1;
    if (count > MAX_MESSAGE_URIS) return false;
    if (!isUri(uri)) return false;
  }
  return true;
}

interface MessageNoIdProof {
  "@context": ContextSigStream;
  type: string;
  actor: Uri;
  object: Uri[];
  published: DateTime;
  to?: Uri[];
  origin?: Uri[];
  target?: Uri[];
}

type MessageNoId = MessageNoIdProof & WithProof;
export type Message = MessageNoId & WithId;

export interface MessageOptions {
  to?: Uri[];
  origin?: Uri[];
  target?: Uri[];
}

export async function newMessage(
  actorDid: Uri,
  objectsId: Uri[],
  type: string,
  published: DateTime | null,
  key: Key,
  options: MessageOptions = {}
): Promise<Message> {
  let actor = `${actorDid}/actor`;
  const message: MessageNoIdProof = {
    "@context": CONTEXT_SIG_STREAM,
    type,
    actor,
    object: objectsId,
    published: published != null ? published : getIsoDate(),
    ...options,
  };
  const messageWithProof = await sign(message, key);
  const cid = (await buildDocCid(messageWithProof)).toString();
  const id = `urn:cid:${cid}`;
  return {
    ...messageWithProof,
    id,
  };
}

export async function verifyMessage(message: Message): Promise<boolean> {
  const did = didFromActorId(message.actor);
  if (!did) return false;
  const id = message.id;
  if (!id.startsWith("urn:cid:")) return false;
  let cid: CID | undefined = undefined;
  try {
    cid = CID.parse(id.slice(8));
  } catch {}
  if (cid == null) return false;
  const messageNoId = omit(message, ["id"]);
  const expectecCid = await buildDocCid(messageNoId);
  if (!isEqual(cid.multihash.bytes, expectecCid.multihash.bytes)) return false;
  if (!(await verify(messageNoId, did))) return false;
  return true;
}

export function isMessage(x: unknown): x is Message {
  if (!isContextSigStream(get(x, "@context"))) return false;
  if (!isUri(get(x, "id"))) return false;
  if (!has(x, "type")) return false;
  if (!isUri(get(x, "actor"))) return false;
  if (!isDateTime(get(x, "published"))) return false;
  if (!isUris(get(x, "object"))) return false;
  const to = get(x, "to");
  if (to != null && !isUris(to)) return false;
  const cc = get(x, "cc");
  if (cc != null && !isUris(cc)) return false;
  const audience = get(x, "cc");
  if (audience != null && !isUris(audience)) return false;
  return true;
}

export function getAudiences(message: Message): Uri[] {
  let audiences: Set<Uri> = new Set();
  if (message.to == null) return [];
  message.to.filter((x) => isUri(x)).forEach((x) => audiences.add(x));
  return [...audiences.values()];
}
