import * as DidKey from "./didkey.js";
import * as Messages from "./messages.js";
import { Servers } from "./servers.js";
import type { Key } from "./signatures.js";
import * as Storage from "./storage.js";
import type { IdNameSuffix } from "./storage.js";
import { orDefault } from "./utils.js";

interface Dbs {
  device: Storage.DbDevice;
  peer: Storage.DbPeer;
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
    private readonly name: string,
    private readonly dbs: Dbs,
    private readonly servers: Servers
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

    const servers = Servers.fromUrls([...peerServers, ...defaultServers]);
    const chatternet = new ChatterNet(key, name, { device, peer }, servers);

    return chatternet;
  }

  stop() {
    this.dbs.peer.db.close();
    this.dbs.device.db.close();
  }

  /**
   * Build the create person message and send to servers.
   * @param name name of account to post to servers
   */
  async buildContext() {
    const did = DidKey.didFromKey(this.key);
    const actor: Messages.Actor = await localGetOrElse(
      `${did}/actor`,
      async () => await Messages.newActor(did, "Person", this.key, { name: this.name })
    );
    const createActor = await Messages.newMessage(did, [actor.id], "Create", null, this.key);
    this.servers
      .postMessage(createActor, did)
      .then(() => this.servers.postObjectDoc(actor))
      .catch((x) => console.error(x));
  }

  /**
   * Post a view message indicating that an object has been viewed.
   * @param message the message whose object is viewed
   */
  async viewMessage(message: Messages.MessageWithId) {
    // don't view indirect messages
    if (message.origin) return;
    const did = DidKey.didFromKey(this.key);
    const view = await Messages.newMessage(did, message.object, "View", null, this.key, {
      origin: message.id,
    });
    this.servers.postMessage(view, did).catch((x) => console.error(x));
    return true;
  }

  getName(): string {
    return this.name;
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
