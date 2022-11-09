import * as DidKey from "./didkey.js";
import * as Messages from "./messages.js";
import type { Key } from "./signatures.js";
import * as Storage from "./storage.js";
import type { IdNameSuffix } from "./storage.js";
import { orDefault } from "./utils.js";

interface Dbs {
  device: Storage.DbDevice;
  peer: Storage.DbPeer;
}

interface Server {
  url: string;
  lastId: string | undefined;
  knownIds: Set<string>;
}

function newServer(url: string): Server {
  const lastId = undefined;
  const knownIds: Set<string> = new Set();
  return { url, lastId, knownIds };
}

async function postMessage(
  message: Messages.Message,
  did: string,
  server: string
): Promise<Response> {
  const url = new URL(`/${did}/actor/outbox`, server);
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify(message),
    headers: { "Content-Type": "application/json" },
  });
  return await fetch(request);
}

async function postObjectDoc(objetDoc: Messages.ObjectDoc, server: string): Promise<Response> {
  const url = new URL(`/${objetDoc.id}`, server);
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify(objetDoc),
    headers: { "Content-Type": "application/json" },
  });
  return await fetch(request);
}

async function localGetOrElse<T>(key: string, or: () => Promise<T>): Promise<T> {
  let value: T | null = JSON.parse(orDefault(window.localStorage.getItem(key), "null"));
  if (value != null) return value;
  value = await or();
  window.localStorage.setItem(key, JSON.stringify(value));
  return value;
}

export class ChatterNet {
  constructor(
    private readonly key: Key,
    private readonly dbs: Dbs,
    private readonly servers: Map<string, Server>,
    private readonly messages: Map<string, Messages.Message> = new Map(),
    private readonly objectDocs: Map<string, Messages.ObjectDoc> = new Map()
  ) {}

  static async newAccount(key: Key, name: string, password: string): Promise<string> {
    const db = await Storage.DbDevice.new();
    const did = DidKey.didFromKey(key);
    const salt = await db.idSalt.getPut(did);
    const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
    await db.keyPair.put(key, cryptoKey);
    await db.idNameSuffix.put(did, name);
    return did;
  }

  static async getDeviceDidNames(): Promise<IdNameSuffix[]> {
    const db = await Storage.DbDevice.new();
    return (await db.idNameSuffix.getAll()).filter((x) => x.id.startsWith("did:"));
  }

  static async clearDbs() {
    await (await Storage.DbDevice.new()).clear();
    await (await Storage.DbPeer.new()).clear();
  }

  static async new(did: string, password: string, defaultServers: string[]): Promise<ChatterNet> {
    const device = await Storage.DbDevice.new();

    const salt = await device.idSalt.getPut(did);
    const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
    const key = await device.keyPair.get(did, cryptoKey);
    if (!key) throw Error(`there is no record for the given DID: ${did}`);

    const idNameSuffix = await device.idNameSuffix.get(did);
    if (!idNameSuffix) throw Error(`there is no name for the given DID: ${did}`);
    const { name } = idNameSuffix;

    const peer = await Storage.DbPeer.new(`Peer_${did}`);
    const peerServers = await peer.server.getUrlsByLastListen();

    const servers = new Map([...peerServers, ...defaultServers].map((x) => [x, newServer(x)]));
    const chatternet = new ChatterNet(key, { device, peer }, servers);

    const actor: Messages.Actor = await localGetOrElse(
      `${did}/actor`,
      async () => await Messages.newActor(did, "Person", key, { name })
    );
    const createActor = await Messages.newMessage(did, [actor.id], "Create", null, key);

    chatternet
      .processMessage(createActor)
      .then(() => chatternet.processObjectDoc(actor))
      .catch((x) => console.error(x));

    return chatternet;
  }

  stop() {
    this.dbs.peer.db.close();
    this.dbs.device.db.close();
  }

  async processMessage(message: Messages.Message) {
    if (!message.id) return;
    if (!Messages.verifyMessage(message)) return;
    this.messages.set(message.id, message);

    const did = DidKey.didFromKey(this.key);

    for (const { url, knownIds } of this.servers.values()) {
      try {
        if (!knownIds.has(message.id)) await postMessage(message, did, url);
        knownIds.add(message.id);
      } catch (err) {
        console.error(err);
      }
    }
  }

  async processObjectDoc(objectDoc: Messages.ObjectDoc) {
    if (!objectDoc.id) return;
    if (!Messages.verifyObjectDoc(objectDoc)) return;
    this.objectDocs.set(objectDoc.id, objectDoc);

    for (const { url, knownIds } of this.servers.values()) {
      try {
        if (!knownIds.has(objectDoc.id)) await postObjectDoc(objectDoc, url);
        knownIds.add(objectDoc.id);
      } catch (err) {
        console.error(err);
      }
    }
  }

  async getIdNameSuffix(did: string, maxLength: number = 8): Promise<IdNameSuffix> {
    let idNameSuffix = await this.dbs.device.idNameSuffix.get(did);
    if (idNameSuffix) return idNameSuffix;
    return {
      id: did,
      name: "",
      suffix: did.split("").reverse().slice(0, maxLength).join(""),
    };
  }
}
