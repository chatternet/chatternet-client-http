import * as Activities from "./activities.js";
import * as DidKey from "./didkey.js";
import * as Storage from "./storage.js";
import { orDefault } from "./utils.js";

interface Dbs {
  device: Storage.DbDevice;
  peer: Storage.DbPeer;
}

async function postMessage(
  message: Activities.Message,
  did: string,
  server: string
): Promise<Response> {
  const url = new URL(`/did/${did}/actor/outbox`, server);
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify(message),
    headers: { "Content-Type": "application/json" },
  });
  return await fetch(request);
}

async function postActor(actor: Activities.Actor, did: string, server: string): Promise<Response> {
  const url = new URL(`/did/${did}/actor`, server);
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify(actor),
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
  constructor(readonly dbs: Dbs, readonly servers: string[]) {}

  static async newAccount(name: string, password: string): Promise<string> {
    const db = await Storage.DbDevice.new();
    const key = await DidKey.newKey();
    const did = DidKey.didFromKey(key);
    const salt = await db.idSalt.getPut(did);
    const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
    await db.keyPair.put(key, cryptoKey);
    await db.nameSuffix.put(did, name);
    return did;
  }

  static async new(
    did: string,
    password: string,
    maxServers: number,
    defaultServers: string[]
  ): Promise<ChatterNet> {
    const device = await Storage.DbDevice.new();

    const salt = await device.idSalt.getPut(did);
    const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
    const key = await device.keyPair.get(did, cryptoKey);
    if (!key) throw Error(`there is no record for the given DID: ${did}`);

    const nameSuffix = await device.nameSuffix.get(did);
    if (!nameSuffix) throw Error(`there is no name for the given DID: ${did}`);
    const { name } = nameSuffix;

    const actor: Activities.Actor = await localGetOrElse(
      `${did}/actor`,
      async () => await Activities.newActor(did, "Person", key, { name })
    );

    const peer = await Storage.DbPeer.new(`Peer_${did}`);
    const peerServers = await peer.server.getUrlsByLastListen();

    const servers = [...peerServers, ...defaultServers].slice(0, maxServers);

    const createActor = await Activities.newMessage(did, [actor.id], "Create", null, key);

    for (const server of servers)
      postMessage(createActor, did, server)
        .then(() => postActor(actor, did, server))
        .catch((x) => console.error(x));

    const chatternet = new ChatterNet({ device, peer }, servers);

    return chatternet;
  }

  stop() {
    this.dbs.peer.db.close();
    this.dbs.device.db.close();
  }

  async getNameSuffix(did: string, maxLength: number = 8): Promise<Storage.NameSuffix> {
    let nameSuffix = await this.dbs.peer.nameSuffix.get(did);
    if (nameSuffix) return nameSuffix;
    return {
      name: "",
      suffix: did.split("").reverse().slice(0, maxLength).join(""),
    };
  }
}
