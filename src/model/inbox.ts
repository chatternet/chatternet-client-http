import type { Message } from "./messages.js";
import { CONTEXT, Context, Uri } from "./utils.js";

export interface Inbox {
  "@context": Context;
  id: Uri;
  type: "OrderedCollection";
  items: Message[];
  partOf: Uri;
  next?: Uri;
}

export function newInbox(
  actorId: string,
  messages: Message[],
  startIdx: number,
  pageSize: number,
  endIdx?: number
): Inbox {
  const partOf = `${actorId}/inbox`;
  const id = `${actorId}/inbox?startIdx=${startIdx}&pageSize=${pageSize}`;
  const next =
    endIdx != null ? `${actorId}/inbox?startIdx=${endIdx}&pageSize=${pageSize}` : undefined;
  return {
    "@context": CONTEXT,
    id,
    type: "OrderedCollection",
    items: messages,
    partOf,
    next,
  };
}
