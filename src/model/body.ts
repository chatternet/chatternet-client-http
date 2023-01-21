import { buildDocCid } from "../signatures.js";
import { CONTEXT, Context, Uri, WithId, isContext, isUri } from "./utils.js";
import { get, omit } from "lodash-es";

interface NoteMd1kNoId {
  "@context": Context;
  type: string;
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
  const body: NoteMd1kNoId = {
    "@context": CONTEXT,
    type: "Note",
    content,
    mediaType: "text/markdown",
    attributedTo,
    ...options,
  };
  const cid = (await buildDocCid(body)).toString();
  const id = `urn:cid:${cid}`;
  return { id, ...body };
}

export async function verifyNoteMd1k(body: NoteMd1k): Promise<boolean> {
  const objectDocNoId = omit(body, ["id"]);
  const cid = (await buildDocCid(objectDocNoId)).toString();
  if (`urn:cid:${cid}` !== body.id) return false;
  return true;
}

export type NoteMd1k = NoteMd1kNoId & WithId;

export function isNoteMd1k(x: unknown): x is NoteMd1k {
  if (!isContext(get(x, "@context"))) return false;
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
