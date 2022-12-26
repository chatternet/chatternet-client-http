import * as Model from "./model/index.js";
import type { ServerInfo } from "./storage.js";
import { get } from "lodash-es";

export interface Server {
  url: string;
  did: string;
  knownIds: Set<string>;
}

export interface InboxOut {
  messages: Model.Message[];
  nextStartIdx?: number;
}

export function newServer(info: ServerInfo): Server {
  const knownIds: Set<string> = new Set();
  return { ...info, knownIds };
}

async function postMessage(
  message: Model.Message,
  did: string,
  serverUrl: string
): Promise<Response> {
  serverUrl = serverUrl.replace(/\/$/, "");
  const url = new URL(`${serverUrl}/ap/${did}/actor/outbox`);
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify(message),
    headers: { "Content-Type": "application/json" },
  });
  return await fetch(request);
}

async function postDocument(document: Model.WithId, serverUrl: string): Promise<Response> {
  serverUrl = serverUrl.replace(/\/$/, "");
  const url = new URL(`${serverUrl}/ap/${document.id}`);
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify(document),
    headers: { "Content-Type": "application/json" },
  });
  return await fetch(request);
}

async function getInbox(
  did: string,
  serverUrl: string,
  startIdx?: number,
  pageSize?: number
): Promise<Response> {
  serverUrl = serverUrl.replace(/\/$/, "");
  const url = new URL(`${serverUrl}/ap/${did}/actor/inbox`);
  if (startIdx) url.searchParams.set("startIdx", startIdx.toString());
  if (pageSize) url.searchParams.set("pageSize", pageSize.toString());
  const request = new Request(url, {
    method: "GET",
  });
  return await fetch(request);
}

async function getBody(id: string, serverUrl: string): Promise<Response> {
  serverUrl = serverUrl.replace(/\/$/, "");
  const url = new URL(`${serverUrl}/ap/${id}`);
  const request = new Request(url, {
    method: "GET",
  });
  return await fetch(request);
}

export class Servers {
  constructor(
    readonly urlsServer: Map<string, Server>,
    readonly documentCache: Map<string, Model.WithId>
  ) {}

  static fromInfos(infos: ServerInfo[]): Servers {
    return new Servers(new Map(infos.map((x) => [x.url, newServer(x)])), new Map());
  }

  async postMessage(message: Model.Message, did: string) {
    // messages are isomorphic to ID, can cache
    this.documentCache.set(message.id, message);
    // keep the servers in sync by sharing all processed messages
    for (const { url, knownIds } of this.urlsServer.values()) {
      if (knownIds.has(message.id)) continue;
      await postMessage(message, did, url);
      knownIds.add(message.id);
    }
  }

  async postDocument(document: Model.WithId) {
    if (document.id.startsWith("urn:cid:"))
      // object ID is a CID, it is isomorphic to its content, can cache
      this.documentCache.set(document.id, document);
    // keep the servers in sync by sharing all processed messages
    for (const { url, knownIds } of this.urlsServer.values()) {
      if (knownIds.has(document.id)) continue;
      await postDocument(document, url);
      knownIds.add(document.id);
    }
  }

  async getDocument(id: string): Promise<Model.WithId | undefined> {
    // first try the local cache
    const local = this.documentCache.get(id);
    if (local != null) return local;

    // want to iterate starting with most likely to have doc
    const servers = [...this.urlsServer.values()];
    servers.sort((a, b) => {
      // a is known, not b: sort a before b
      if (a.knownIds.has(id) && !b.knownIds.has(id)) return -1;
      // b is known, not a: sort b before a
      if (!a.knownIds.has(id) && b.knownIds.has(id)) return +1;
      return 0;
    });

    for (const server of servers) {
      let response: Response;
      try {
        response = await getBody(id, server.url);
      } catch {
        continue;
      }
      if (!response.ok) continue;
      const body: unknown = await response.json();
      if (!Model.isBody(body)) continue;
      server.knownIds.add(body.id);
      return body;
    }
  }

  static getNextStartIdxFromPage(page: any): number | undefined {
    const next = get(page, "next");
    if (next == null) return;
    const startIdx = new URL(next).searchParams.get("startIdx");
    if (startIdx == null) return;
    return +startIdx;
  }

  async getInbox(
    url: string,
    did: string,
    startIdx?: number,
    pageSize?: number
  ): Promise<InboxOut> {
    const server = this.urlsServer.get(url);
    if (!server) throw Error("server URL is not known");
    const response = await getInbox(did, url, startIdx, pageSize);
    if (!response.ok) throw Error("unable to get inbox");
    const page: unknown = await response.json();
    const nextStartIdx = Servers.getNextStartIdxFromPage(page);
    const items: unknown = get(page, "items");
    if (!Array.isArray(items)) throw Error("inbox message are incorrectly formatted");
    const messages = items.filter(Model.isMessage);
    // side effects
    for (const message of messages) server.knownIds.add(message.id);
    const messagesValid: Model.Message[] = [];
    for (const message of messages)
      if (await Model.verifyMessage(message)) messagesValid.push(message);
    return { messages: messagesValid, nextStartIdx };
  }
}
