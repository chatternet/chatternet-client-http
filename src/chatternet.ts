import * as DidKey from "./didkey.js";
import { MessageIter } from "./messageiter.js";
import * as Messages from "./messages.js";
import { Servers } from "./servers.js";
import type { Key } from "./signatures.js";
import * as Storage from "./storage.js";
import type { IdName } from "./storage.js";

interface Dbs {
  device: Storage.DbDevice;
  peer: Storage.DbPeer;
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

  static async new(
    did: string,
    password: string,
    defaultServers: Storage.ServerInfo[]
  ): Promise<ChatterNet> {
    const device = await Storage.DbDevice.new();

    const salt = await device.idSalt.getPut(did);
    const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
    const key = await device.keyPair.get(did, cryptoKey);
    if (!key) throw Error("DID, password combination is incorrect.");

    const idNameSuffix = await device.idName.get(did);
    if (!idNameSuffix) throw Error("there is no name for the given DID");
    const { name } = idNameSuffix;

    const peer = await Storage.DbPeer.new(`Peer_${did}`);
    const peerServers = await peer.server.getByLastListen();

    // TODO: server selection
    const servers = Servers.fromInfos([...peerServers, ...defaultServers]);
    const chatternet = new ChatterNet(name, key, { device, peer }, servers);

    // share which servers the peer is listening to
    for (const peerServer of peerServers)
      chatternet
        .postMessageObjectDoc(await chatternet.newListen(`${peerServer.did}/actor`, peerServer.url))
        .catch((x) => console.error(x));

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

  async newFollow(id: string, audience?: string[]): Promise<MessageObjectDoc> {
    await this.dbs.peer.follow.put(id);
    await this.dbs.peer.follow.put(`${id}/followers`);
    const did = this.getDid();
    audience = audience ? audience : [`${did}/actor/followers`, `${id}/followers`];
    const message = await Messages.newMessage(did, [id], "Follow", null, this.key, {
      audience,
    });
    return { message };
  }

  async newListen(actorId: string, url?: string, audience?: string[]): Promise<MessageObjectDoc> {
    await this.dbs.peer.follow.put(actorId);
    const did = this.getDid();
    audience = audience ? audience : [`${did}/actor/followers`, `${actorId}/followers`];
    const objectDoc = await Messages.newActor(actorId, "Server", undefined, { url });
    const message = await Messages.newMessage(did, [actorId], "Listen", null, this.key, {
      audience,
    });
    return { message, objectDoc };
  }

  async newView(
    message: Messages.MessageWithId,
    audience?: string[]
  ): Promise<Messages.MessageWithId | undefined> {
    // don't view messages from self
    const did = DidKey.didFromKey(this.key);
    if (message.actor === `${did}/actor`) return;
    // don't view indirect messages
    if (message.origin) return;
    audience = audience ? audience : [`${did}/actor/followers`];
    const view = await Messages.newMessage(did, message.object, "View", null, this.key, {
      origin: message.id,
      audience,
    });
    return view;
  }

  async addServer(did: string, url: string, lastListenTimestamp: number) {
    this.dbs.peer.server.update({ info: { url, did }, lastListenTimestamp });
  }

  async getActorMessage(): Promise<MessageObjectDoc> {
    const did = this.getDid();
    const name = this.getName();
    const objectDoc = await Messages.newActor(did, "Person", this.key, { name });
    const message = await Messages.newMessage(did, [objectDoc.id], "Create", null, this.key);
    return { message, objectDoc };
  }

  async getFollowsMessage(): Promise<MessageObjectDoc> {
    const followSelf = `${this.getDid()}/actor`;
    const follows = [...new Set([...(await this.dbs.peer.follow.getAll()), followSelf])];
    const message = await Messages.newMessage(this.getDid(), follows, "Follow", null, this.key);
    return { message };
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
