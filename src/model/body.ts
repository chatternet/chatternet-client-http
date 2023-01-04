import { buildDocCid } from "../signatures.js";
import { CONTEXT, Context, WithId, isContext, isUri } from "./utils.js";
import { get, has, omit } from "lodash-es";

const MAX_NOTE_CONTENT_BYTES = 1024;

interface BodyNoId {
  "@context": Context;
  type: string;
  content?: string;
  mediaType?: string;
}

export interface BodyOptions {
  content?: string;
  mediaType?: string;
}

export async function newBody(type: string, options: BodyOptions = {}): Promise<Body> {
  const { content, mediaType } = options;
  if (type === "Note" && content != null && content.length > MAX_NOTE_CONTENT_BYTES)
    throw Error("note content is too long");
  const body: BodyNoId = {
    "@context": CONTEXT,
    type,
    content,
    mediaType,
  };
  const cid = (await buildDocCid(body)).toString();
  const id = `urn:cid:${cid}`;
  return { id, ...body };
}

export async function verifyBody(body: Body): Promise<boolean> {
  if (body.type === "Note" && body.content != null && body.content.length > MAX_NOTE_CONTENT_BYTES)
    return false;
  const objectDocNoId = omit(body, ["id"]);
  const cid = (await buildDocCid(objectDocNoId)).toString();
  if (`urn:cid:${cid}` !== body.id) return false;
  return true;
}

export type Body = BodyNoId & WithId;

export function isBody(x: unknown): x is Body {
  if (!isContext(get(x, "@context"))) return false;
  if (!isUri(get(x, "id"))) return false;
  if (!has(x, "type")) return false;
  return true;
}
