import type { Message } from "./messages.js";
import { CONTEXT_SIG_STREAM, ContextSigStream, Uri } from "./utils.js";

export interface Inbox {
  "@context": ContextSigStream;
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
    "@context": CONTEXT_SIG_STREAM,
    id,
    type: "OrderedCollection",
    items: messages,
    partOf,
    next,
  };
}
