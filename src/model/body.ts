import { buildDocCid } from "../signatures.js";
import { CONTEXT, Context, Uri, WithId, isContext, isUri } from "./utils.js";
import { get, has, omit } from "lodash-es";

interface BodyNoId {
  "@context": Context;
  type: string;
  content?: string;
  mediaType?: string;
  attributedTo?: Uri;
  inReplyTo?: Uri;
}

export interface BodyOptions {
  content?: string;
  mediaType?: string;
  attributedTo?: string;
  inReplyTo?: string;
}

export async function newBody(type: string, options: BodyOptions = {}): Promise<Body> {
  const body: BodyNoId = {
    "@context": CONTEXT,
    type,
    ...options,
  };
  const cid = (await buildDocCid(body)).toString();
  const id = `urn:cid:${cid}`;
  return { id, ...body };
}

export async function verifyBody(body: Body): Promise<boolean> {
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
  const inReplyTo = get(x, "inReplyTo");
  if (inReplyTo != null && !isUri(inReplyTo)) return false;
  return true;
}
