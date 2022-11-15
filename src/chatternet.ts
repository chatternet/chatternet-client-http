import * as DidKey from "./didkey.js";
import { MessageIter } from "./messageiter.js";
import * as Messages from "./messages.js";
import { Servers } from "./servers.js";
import type { Key } from "./signatures.js";
import * as Storage from "./storage.js";
import type { IdName } from "./storage.js";
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
    await db.idName.put(did, name);
    return did;
  }

  static async getDeviceDidNames(): Promise<IdName[]> {
    const db = await Storage.DbDevice.new();
    return (await db.idName.getAll()).filter((x) => x.id.startsWith("did:"));
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

    const idNameSuffix = await device.idName.get(did);
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

  async postMessages(message: Messages.MessageWithId) {
    this.servers.postMessage(message, this.getDid());
  }

  async createActor(): Promise<Messages.MessageWithId> {
    const did = this.getDid();
    const actor: Messages.Actor = await localGetOrElse(
      `${did}/actor`,
      async () => await Messages.newActor(did, "Person", this.key, { name: this.name })
    );
    const createActor = await Messages.newMessage(did, [actor.id], "Create", null, this.key);
    return createActor;
  }

  async viewMessage(message: Messages.MessageWithId): Promise<Messages.MessageWithId | undefined> {
    // don't view indirect messages
    if (message.origin) return;
    const did = DidKey.didFromKey(this.key);
    const view = await Messages.newMessage(did, message.object, "View", null, this.key, {
      origin: message.id,
    });
    return view;
  }

  getDid(): string {
    return DidKey.didFromKey(this.key);
  }

  getName(): string {
    return this.name;
  }

  async getIdName(did: string): Promise<IdName | undefined> {
    return await this.dbs.device.idName.get(did);
  }

  async getObjectDoc(id: string): Promise<Messages.ObjectDocWithId | undefined> {
    return await this.servers.getObjectDoc(id);
  }

  async buildMessageIter(): Promise<MessageIter> {
    return await MessageIter.new(this.getDid(), this.servers);
  }
}
