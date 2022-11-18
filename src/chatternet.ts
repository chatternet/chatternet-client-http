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

export interface MessageObjectDoc {
  message: Messages.MessageWithId;
  objectDoc?: Messages.ObjectDocWithId;
}

export class ChatterNet {
  private name: string;

  constructor(
    name: string,
    private readonly key: Key,
    private readonly dbs: Dbs,
    private readonly servers: Servers
  ) {
    this.name = name;
  }

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
    const chatternet = new ChatterNet(name, key, { device, peer }, servers);

    return chatternet;
  }

  stop() {
    this.dbs.peer.db.close();
    this.dbs.device.db.close();
  }

  async changeName(name: string) {
    this.name = name;
    await this.dbs.device.idName.put(this.getDid(), name);
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    const did = this.getDid();
    const salt = await this.dbs.device.idSalt.getPut(did);
    const oldCryptoKey = await Storage.cryptoKeyFromPassword(oldPassword, salt);
    const confirmKey = await this.dbs.device.keyPair.get(did, oldCryptoKey);
    if (confirmKey?.fingerprint() !== this.key.fingerprint()) return false;
    const newCryptoKey = await Storage.cryptoKeyFromPassword(newPassword, salt);
    await this.dbs.device.keyPair.put(this.key, newCryptoKey);
    return true;
  }

  async postMessageObjectDoc(messageObjectDoc: MessageObjectDoc) {
    this.servers
      .postMessage(messageObjectDoc.message, this.getDid())
      .then(() =>
        messageObjectDoc.objectDoc ? this.servers.postObjectDoc(messageObjectDoc.objectDoc) : null
      )
      .catch((x) => console.error(x));
  }

  async newNote(content: string, audience?: string[]): Promise<MessageObjectDoc> {
    const did = this.getDid();
    audience = audience ? audience : [`${did}/actor/followers`];
    const objectDoc = await Messages.newObjectDoc("Note", { content });
    const message = await Messages.newMessage(did, [objectDoc.id], "Create", null, this.key, {
      audience,
    });
    return { message, objectDoc };
  }

  async newActor(): Promise<MessageObjectDoc> {
    const did = this.getDid();
    const audience = [`${did}/actor/followers`];
    const objectDoc: Messages.Actor = await localGetOrElse(
      `${did}/actor`,
      async () => await Messages.newActor(did, "Person", this.key, { name: this.name })
    );
    const message = await Messages.newMessage(did, [objectDoc.id], "Create", null, this.key, {
      audience,
    });
    return { message, objectDoc };
  }

  async newFollow(actorId: string, audience?: string[]): Promise<MessageObjectDoc> {
    const did = this.getDid();
    audience = audience ? audience : [`${did}/actor/followers`, `${actorId}/followers`];
    const message = await Messages.newMessage(did, [actorId], "Follow", null, this.key, {
      audience,
    });
    return { message };
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

  async getActor(id: string): Promise<Messages.Actor | undefined> {
    return await this.servers.getActor(id);
  }

  getDid(): string {
    return DidKey.didFromKey(this.key);
  }

  getName(): string {
    return this.name;
  }

  async getObjectDoc(id: string): Promise<Messages.ObjectDocWithId | undefined> {
    return await this.servers.getObjectDoc(id);
  }

  async buildMessageIter(): Promise<MessageIter> {
    return await MessageIter.new(this.getDid(), this.servers);
  }
}
