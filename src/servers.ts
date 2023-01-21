import * as Model from "./model/index.js";
import { isWithId } from "./model/utils.js";
import type { ServerInfo } from "./storage.js";
import { get } from "lodash-es";

export interface Server {
  url: string;
  did: string;
  knownIds: Set<string>;
}

export interface PageOut {
  items: unknown[];
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

async function getPaginated(
  uri: string,
  serverUrl: string,
  startIdx?: number,
  pageSize?: number
): Promise<Response> {
  serverUrl = serverUrl.replace(/\/$/, "");
  const url = new URL(`${serverUrl}/ap/${uri}`);
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

async function getCreateMessageForDocument(
  id: string,
  actorId: string,
  serverUrl: string
): Promise<Response> {
  serverUrl = serverUrl.replace(/\/$/, "");
  const url = new URL(`${serverUrl}/ap/${id}/createdBy/${actorId}`);
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
    let anySuccess = false;
    // messages are isomorphic to ID, can cache
    this.documentCache.set(message.id, message);
    // keep the servers in sync by sharing all processed messages
    for (const { url, knownIds } of this.urlsServer.values()) {
      const response = await postMessage(message, did, url);
      if (!response.ok) {
        console.info("message failed to post to %s: %s", url, await response.text());
        continue;
      }
      knownIds.add(message.id);
      anySuccess = true;
    }
    if (!anySuccess) throw Error("message failed to post to any server");
  }

  async postDocument(document: Model.WithId) {
    let anySuccess = false;
    if (document.id.startsWith("urn:cid:"))
      // object ID is a CID, it is isomorphic to its content, can cache
      this.documentCache.set(document.id, document);
    // keep the servers in sync by sharing all processed messages
    for (const { url, knownIds } of this.urlsServer.values()) {
      const response = await postDocument(document, url);
      if (!response.ok) {
        console.info("document failed to post to %s: %s", url, await response.text());
        continue;
      }
      knownIds.add(document.id);
      anySuccess = true;
    }
    if (!anySuccess) throw Error("document failed to post to any server");
  }

  sortServersByKnownId(id: string): Server[] {
    // want to iterate starting with most likely to have doc
    const servers = [...this.urlsServer.values()];
    servers.sort((a, b) => {
      // a is known, not b: sort a before b
      if (a.knownIds.has(id) && !b.knownIds.has(id)) return -1;
      // b is known, not a: sort b before a
      if (!a.knownIds.has(id) && b.knownIds.has(id)) return +1;
      return 0;
    });
    return servers;
  }

  async getDocument(id: string): Promise<Model.WithId | undefined> {
    // first try the local cache
    const local = this.documentCache.get(id);
    if (local != null) return local;

    const servers = this.sortServersByKnownId(id);

    for (const server of servers) {
      let response: Response;
      try {
        response = await getBody(id, server.url);
      } catch {
        continue;
      }
      if (!response.ok) continue;
      const body: unknown = await response.json();
      // TODO: create property body model and test that
      // TODO: validate ID
      if (!isWithId(body)) continue;
      server.knownIds.add(body.id);
      return body;
    }
  }

  async getCreateMessageForDocument(
    id: string,
    actorId: string
  ): Promise<Model.Message | undefined> {
    const servers = this.sortServersByKnownId(id);

    for (const server of servers) {
      let response: Response;
      try {
        response = await getCreateMessageForDocument(id, actorId, server.url);
      } catch {
        continue;
      }
      if (!response.ok) continue;
      const message: unknown = await response.json();
      if (!Model.isMessage(message)) continue;
      if (!(await Model.verifyMessage(message))) continue;
      return message;
    }
  }

  static getNextStartIdxFromPage(page: any): number | undefined {
    const next = get(page, "next");
    if (next == null) return;
    const startIdx = new URL(next).searchParams.get("startIdx");
    if (startIdx == null) return;
    return +startIdx;
  }

  async getPaginated(
    uri: string,
    serverUrl: string,
    startIdx?: number,
    pageSize?: number
  ): Promise<PageOut> {
    const server = this.urlsServer.get(serverUrl);
    if (!server) throw Error("server URL is not known");
    const response = await getPaginated(uri, serverUrl, startIdx, pageSize);
    if (!response.ok) throw Error("unable to get paginated resource");
    const page: unknown = await response.json();
    const nextStartIdx = Servers.getNextStartIdxFromPage(page);
    const items: unknown = get(page, "items");
    if (!Array.isArray(items)) throw Error("page is incorrectly formatted");
    return { items, nextStartIdx };
  }
}
