import { buildDocCid } from "../signatures.js";
import { CONTEXT, Context, Uri, WithId, isContext, isUri } from "./utils.js";
import { get, omit } from "lodash-es";

interface Note1kNoId {
  "@context": Context;
  type: string;
  content: string;
  mediaType?: string;
  attributedTo?: Uri;
  inReplyTo?: Uri;
}

export interface Note1kOptions {
  mediaType?: string;
  attributedTo?: string;
  inReplyTo?: string;
}

export async function newNote1k(content: string, options: Note1kOptions = {}): Promise<Note1k> {
  if (content.length > 1024) throw new Error("Content too long");
  const body: Note1kNoId = {
    "@context": CONTEXT,
    type: "Note",
    content,
    ...options,
  };
  const cid = (await buildDocCid(body)).toString();
  const id = `urn:cid:${cid}`;
  return { id, ...body };
}

export async function verifyNote1k(body: Note1k): Promise<boolean> {
  const objectDocNoId = omit(body, ["id"]);
  const cid = (await buildDocCid(objectDocNoId)).toString();
  if (`urn:cid:${cid}` !== body.id) return false;
  return true;
}

export type Note1k = Note1kNoId & WithId;

export function isNote1k(x: unknown): x is Note1k {
  if (!isContext(get(x, "@context"))) return false;
  if (!isUri(get(x, "id"))) return false;
  if (get(x, "type") !== "Note") return false;
  const content = get(x, "content");
  if (content == null) return false;
  if (typeof content !== "string") return false;
  // @ts-ignore
  if (content.len > 1024) return false;
  const inReplyTo = get(x, "inReplyTo");
  if (inReplyTo != null && !isUri(inReplyTo)) return false;
  return true;
}
