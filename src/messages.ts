import { DateTime, Key, Proof, Uri, buildDocCid, sign, verify } from "./signatures.js";
import { getIsoDate } from "./utils.js";
import { has, omit } from "lodash-es";

const CONTEXT_ACTIVITY_STREAMS = "https://www.w3.org/ns/activitystreams";
const CONTEXT_CREDENTIALS = "https://www.w3.org/2018/credentials/v1";

export interface WithId {
  id: string;
}

interface ObjectBase {
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

interface ActivityBase extends ObjectBase {
  actor?: any;
  object?: any;
  target?: any;
  result?: any;
  origin?: any;
  instrument?: any;
}

export interface ObjectDoc extends ObjectBase {
  "@context": string[];
  id?: Uri;
  type: String;
}

export async function newObjectDoc(
  type: string,
  members?: Omit<ObjectBase, "id" | "type">
): Promise<ObjectDocWithId> {
  const objectDoc: ObjectDoc = {
    ...members,
    "@context": [CONTEXT_ACTIVITY_STREAMS],
    type,
    ...members,
  };
  const cid = (await buildDocCid(objectDoc)).toString();
  const id = `urn:cid:${cid}`;
  return { ...objectDoc, id };
}

export async function verifyObjectDoc(objectDoc: ObjectDoc): Promise<boolean> {
  let objectDocForId = omit(objectDoc, ["id"]);
  let cid = (await buildDocCid(objectDocForId)).toString();
  if (`urn:cid:${cid}` !== objectDoc.id) return false;
  return true;
}

export type ObjectDocWithId = ObjectDoc & WithId;

export function isObjectDocWithId(message: unknown): message is ObjectDocWithId {
  if (!has(message, "@context")) return false;
  if (!has(message, "id")) return false;
  if (!has(message, "type")) return false;
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

export interface Actor extends ObjectBase {
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
  members?: Omit<ObjectBase, "id" | "type">
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

export function isActor(message: unknown): message is Actor {
  if (!has(message, "@context")) return false;
  if (!has(message, "id")) return false;
  if (!has(message, "type")) return false;
  if (!has(message, "inbox")) return false;
  if (!has(message, "outbox")) return false;
  if (!has(message, "following")) return false;
  if (!has(message, "followers")) return false;
  return true;
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

export interface Message extends ActivityBase {
  "@context": string[];
  id?: Uri;
  type: string;
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
  members?: Omit<ActivityBase, "id" | "type" | "actor" | "object" | "published">
): Promise<MessageWithId> {
  let actor = `${actorDid}/actor`;
  const message: Message = {
    "@context": [CONTEXT_ACTIVITY_STREAMS, CONTEXT_CREDENTIALS],
    type,
    actor,
    object: objectsId,
    published: published != null ? published : getIsoDate(),
    ...members,
  };
  const cid = (await buildDocCid(message)).toString();
  const id = `urn:cid:${cid}`;
  const messageWithId = {
    ...message,
    id,
  };
  return await sign(messageWithId, key);
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

export type MessageWithId = Message & WithId;

export function isMessageWithId(message: unknown): message is MessageWithId {
  if (!has(message, "@context")) return false;
  if (!has(message, "id")) return false;
  if (!has(message, "type")) return false;
  if (!has(message, "actor")) return false;
  if (!has(message, "object")) return false;
  if (!has(message, "published")) return false;
  return true;
}
