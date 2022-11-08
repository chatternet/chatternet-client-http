import { DateTime, Key, Proof, Uri, buildDocCid, sign, verify } from "./signatures.js";
import { getIsoDate } from "./utils.js";
import { omit } from "lodash-es";

const CONTEXT_ACTIVITY_STREAMS = "https://www.w3.org/ns/activitystreams";
const CONTEXT_CREDENTIALS = "https://www.w3.org/2018/credentials/v1";

interface BaseObject {
  attachment?: any;
  attributedTo?: any;
  audience?: any;
  content?: any;
  context?: any;
  name?: any;
  endTime?: any;
  generator?: any;
  icon?: any;
  image?: any;
  inReplyTo?: any;
  location?: any;
  preview?: any;
  published?: any;
  replies?: any;
  startTime?: any;
  summary?: any;
  tag?: any;
  updated?: any;
  url?: any;
  to?: any;
  bto?: any;
  cc?: any;
  bcc?: any;
  mediaType?: any;
  duration?: any;
}

export interface ObjectDoc extends BaseObject {
  "@context": string[];
  id?: Uri;
  type: String;
}

export async function newObjectDoc(
  type: string,
  members?: Omit<BaseObject, "id" | "type">
): Promise<ObjectDoc> {
  const objectDoc: ObjectDoc = {
    ...members,
    "@context": [CONTEXT_ACTIVITY_STREAMS],
    type,
    ...members,
  };
  let cid = (await buildDocCid(objectDoc)).toString();
  objectDoc.id = `urn:cid:${cid}`;
  return objectDoc;
}

export async function verifyObjectDoc(objectDoc: ObjectDoc): Promise<boolean> {
  let objectDocForId = omit(objectDoc, ["id"]);
  let cid = (await buildDocCid(objectDocForId)).toString();
  if (`urn:cid:${cid}` !== objectDoc.id) return false;
  return true;
}

export interface Inbox {
  "@context": string[];
  id: Uri;
  type: "OrderedCollection";
  orderedItems: Message[];
}

export function newInbox(actorId: string, messages: Message[], after?: string): Inbox {
  const id = after != null ? `${actorId}/inbox?after=${after}` : `${actorId}/inbox`;
  return {
    "@context": [CONTEXT_ACTIVITY_STREAMS],
    id,
    type: "OrderedCollection",
    orderedItems: messages,
  };
}

export interface Actor extends BaseObject {
  "@context": [string, string];
  id: Uri;
  type: string;
  inbox: Uri;
  outbox: Uri;
  following: Uri;
  followers: Uri;
  proof?: Proof;
}

export async function newActor(
  did: Uri,
  type: string,
  key: Key,
  members?: Omit<BaseObject, "id" | "type">
): Promise<Actor> {
  if (members && !key) throw Error("actor members added without a key");
  const id = `${did}/actor`;
  const inbox = `${id}/inbox`;
  const outbox = `${id}/outbox`;
  const following = `${id}/following`;
  const followers = `${id}/followers`;
  const actor: Actor = {
    "@context": [CONTEXT_ACTIVITY_STREAMS, CONTEXT_CREDENTIALS],
    id,
    type,
    inbox,
    outbox,
    following,
    followers,
    ...members,
  };
  if (key) return await sign(actor, key);
  return actor;
}

export function didFromActorId(actorId: string): string | undefined {
  const [did, path] = actorId.split("/", 2);
  if (path != "actor") return undefined;
  if (!did.startsWith("did:")) return undefined;
  return did;
}

export async function verifyActor(actor: Actor): Promise<boolean> {
  const did = didFromActorId(actor.id);
  if (!did) return false;
  if (actor.inbox !== `${actor.id}/inbox`) return false;
  if (actor.outbox !== `${actor.id}/outbox`) return false;
  if (actor.following !== `${actor.id}/following`) return false;
  if (actor.followers !== `${actor.id}/followers`) return false;
  if (!(await verify(actor, did))) return false;
  return true;
}

export interface Message extends BaseObject {
  "@context": string[];
  id?: Uri;
  type: String;
  actor: Uri;
  object: Uri[];
  published: DateTime;
  proof?: Proof;
}

export async function newMessage(
  actorDid: Uri,
  objectsId: Uri[],
  type: string,
  published: DateTime | null,
  key: Key,
  members?: Omit<BaseObject, "id" | "type" | "actor" | "object" | "published">
): Promise<Message> {
  let actor = `${actorDid}/actor`;
  const message: Message = {
    ...members,
    "@context": [CONTEXT_ACTIVITY_STREAMS, CONTEXT_CREDENTIALS],
    type,
    actor,
    object: objectsId,
    published: published != null ? published : getIsoDate(),
    ...members,
  };
  let cid = (await buildDocCid(message)).toString();
  message.id = `urn:cid:${cid}`;
  return await sign(message, key);
}

export async function verifyMessage(message: Message): Promise<boolean> {
  const did = didFromActorId(message.actor);
  if (!did) return false;
  let messageForId = omit(message, ["id", "proof"]);
  let cid = (await buildDocCid(messageForId)).toString();
  if (`urn:cid:${cid}` !== message.id) return false;
  if (!(await verify(message, did))) return false;
  return true;
}
