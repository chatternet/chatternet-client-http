import { buildDocCid } from "../signatures.js";
import { CONTEXT_STREAM, ContextStream, Uri, WithId, isContextStream, isUri } from "./utils.js";
import { get, omit } from "lodash-es";

interface NoteMd1kNoId {
  "@context": ContextStream;
  type: "Note";
  content: string;
  mediaType: "text/markdown";
  attributedTo: Uri;
  inReplyTo?: Uri;
}

export interface NoteMd1kOptions {
  inReplyTo?: string;
}

export async function newNoteMd1k(
  content: string,
  attributedTo: string,
  options: NoteMd1kOptions = {}
): Promise<NoteMd1k> {
  if (new TextEncoder().encode(content).length > 1024) throw new Error("Content too long");
  const document: NoteMd1kNoId = {
    "@context": CONTEXT_STREAM,
    type: "Note",
    content,
    mediaType: "text/markdown",
    attributedTo,
    ...options,
  };
  const cid = (await buildDocCid(document)).toString();
  const id = `urn:cid:${cid}`;
  return { id, ...document };
}

export async function verifyNoteMd1k(document: NoteMd1k): Promise<boolean> {
  const objectDocNoId = omit(document, ["id"]);
  const cid = (await buildDocCid(objectDocNoId)).toString();
  if (`urn:cid:${cid}` !== document.id) return false;
  return true;
}

export type NoteMd1k = NoteMd1kNoId & WithId;

export function isNoteMd1k(x: unknown): x is NoteMd1k {
  if (!isContextStream(get(x, "@context"))) return false;
  if (!isUri(get(x, "id"))) return false;
  if (get(x, "type") !== "Note") return false;
  const content = get(x, "content");
  if (content == null) return false;
  if (typeof content !== "string") return false;
  if (new TextEncoder().encode(content).length > 1024) return false;
  if (get(x, "mediaType") !== "text/markdown") return false;
  if (!isUri(get(x, "attributedTo"))) return false;
  const inReplyTo = get(x, "inReplyTo");
  if (inReplyTo != null && !isUri(inReplyTo)) return false;
  return true;
}

interface Tag30NoId {
  "@context": ContextStream;
  type: "Object";
  name: string;
}

export async function newTag30(name: string): Promise<Tag30> {
  if (name.split("").length > 30) throw new Error("Name too long");
  const document: Tag30NoId = {
    "@context": CONTEXT_STREAM,
    type: "Object",
    name,
  };
  const cid = (await buildDocCid(document)).toString();
  const id = `urn:cid:${cid}`;
  return { id, ...document };
}

export async function verifyTag30(document: Tag30): Promise<boolean> {
  const objectDocNoId = omit(document, ["id"]);
  const cid = (await buildDocCid(objectDocNoId)).toString();
  if (`urn:cid:${cid}` !== document.id) return false;
  return true;
}

export type Tag30 = Tag30NoId & WithId;

export function isTag30(x: unknown): x is Tag30 {
  if (!isContextStream(get(x, "@context"))) return false;
  if (!isUri(get(x, "id"))) return false;
  if (get(x, "type") !== "Object") return false;
  const name = get(x, "name");
  if (name == null) return false;
  if (typeof name !== "string") return false;
  // @ts-ignore
  if (name.split("").length > 30) return false;
  return true;
}
