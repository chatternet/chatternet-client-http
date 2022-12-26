import * as DidKey from "./didkey.js";
import { MessageIter } from "./messageiter.js";
import type { Actor, Body, Message } from "./model/index.js";
import * as Model from "./model/index.js";
import { Servers } from "./servers.js";
import type { Key } from "./signatures.js";
import * as Storage from "./storage.js";
import type { IdName } from "./storage.js";

interface Dbs {
  device: Storage.DbDevice;
  peer: Storage.DbPeer;
}

/**
 * A `Message` document and optionally any of the `Object` documents listed in
 * the message's `object` property.
 *
 * `Message` documents are used to send meta-data. The content is typically
 * stored in a separate `Object` document which is listed in the message's
 * `object` property.
 */
export interface MessageBodies {
  message: Message;
  bodies: Body[];
}

/**
 * Values used to determine a message's affinity to a user's inbox.
 */
export interface MessageAffinity {
  fromContact: boolean;
  inAudience: boolean;
}

/**
 * Chatter Net client.
 *
 * This object provides interfaces to access global Chatter Net state through
 * HTTP calls to servers, and local node state using `IndexedDB`.
 */
export class ChatterNet {
  private name: string;

  /**
   * Construct a new instance with specific state.
   *
   * See `ChatterNet.new` which will call this constructor with state
   * initialized for a given actor.
   *
   * @param name the user name of the local actor
   * @param key the full key of the local actor
   * @param dbs the local databases
   * @param servers information about servers to communicate with to exchange
   *   global state
   */
  constructor(
    name: string,
    private readonly key: Key,
    private readonly dbs: Dbs,
    private readonly servers: Servers
  ) {
    this.name = name;
  }

  /**
   * Create a new account and persist it in the local state.
   *
   * This is a local operation. The account will be known to servers only once
   * messages are sent to those severs by the account.
   *
   * The account is authenticated using its private key which is stored
   * locally. A malicious actor needs to gain access to the local storage
   * (usually by having access to the physical device) to steal the private key.
   *
   * Leaving the password blank means that anyone with access to the local
   * device can gain access to the private key. If the user believes their
   * local device and browser are secure, it is possible though not advisable
   * to use a blank password.
   *
   * @param key the full key of the account
   * @param name the user name to associate with the account
   * @param password the password used to encrypt the public key
   * @returns the account's DID
   */
  static async newAccount(key: Key, name: string, password: string): Promise<string> {
    const db = await Storage.DbDevice.new();
    const did = DidKey.didFromKey(key);
    const salt = await db.idSalt.getPut(did);
    const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
    await db.keyPair.put(key, cryptoKey);
    await db.idName.put(did, name);
    return did;
  }

  /**
   * List DIDs of accounts in the local store and associated user names.
   *
   * @returns list of IDs and names
   */
  static async getAccountNames(): Promise<IdName[]> {
    const db = await Storage.DbDevice.new();
    const dids = await db.keyPair.getDids();
    const idNames = [];
    for (const did of dids) {
      const idName = await db.idName.get(did);
      if (idName == null) continue;
      idNames.push(idName);
    }
    return idNames;
  }

  /**
   * Clear all all local stores.
   */
  static async clearDbs() {
    await (await Storage.DbDevice.new()).clear();
    await (await Storage.DbPeer.new()).clear();
  }

  /**
   * Build a new client for the given actor DID.
   *
   * @param did actor DID
   * @param password password used to encrypt the DID's key
   * @param defaultServers connect to these servers on top of as any known
   *   to the local actor
   * @returns a new `ChatterNet` client instance.
   */
  static async new(
    did: string,
    password: string,
    defaultServers: Storage.ServerInfo[]
  ): Promise<ChatterNet> {
    const device = await Storage.DbDevice.new();

    // decrypt the key for this actor
    const salt = await device.idSalt.getPut(did);
    const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
    const key = await device.keyPair.get(did, cryptoKey);
    if (!key) throw Error("DID, password combination is incorrect.");

    // find the last known user name for this actor
    const idNameSuffix = await device.idName.get(did);
    if (!idNameSuffix) throw Error("there is no name for the given DID");
    const { name } = idNameSuffix;

    // find the servers this actor should listen to
    const peer = await Storage.DbPeer.new(`Peer_${did}`);
    const peerServers = await peer.server.getByLastListen();
    const servers = Servers.fromInfos([...peerServers, ...defaultServers]);
    const chatterNet = new ChatterNet(name, key, { device, peer }, servers);

    // tell the server about the user name
    const actorMessageObjectDoc = await chatterNet.buildActor();
    chatterNet.storeMessageBodies(actorMessageObjectDoc);
    chatterNet.postMessageObjectDoc(actorMessageObjectDoc).catch(() => {});
    // tell the server about the actor follows
    chatterNet.postMessageObjectDoc(await chatterNet.buildFollows()).catch(() => {});

    return chatterNet;
  }

  /**
   * Change the user name.
   *
   * This is a local operation.
   *
   * @param name the new user name
   */
  async changeName(name: string): Promise<MessageBodies> {
    this.name = name;
    await this.dbs.device.idName.put(this.getLocalDid(), name);
    return await this.buildActor();
  }

  /**
   * Change the password and re-encrypt the actor key with the new password.
   *
   * @param oldPassword ensure the user knows the current password
   * @param newPassword the new password
   * @returns returns true if the password was changed
   */
  async changePassword(oldPassword: string, newPassword: string) {
    const did = this.getLocalDid();
    const salt = await this.dbs.device.idSalt.getPut(did);
    const oldCryptoKey = await Storage.cryptoKeyFromPassword(oldPassword, salt);
    const confirmKey = await this.dbs.device.keyPair.get(did, oldCryptoKey);
    if (confirmKey?.fingerprint() !== this.key.fingerprint())
      throw Error("current password is incorrect");
    const newCryptoKey = await Storage.cryptoKeyFromPassword(newPassword, salt);
    await this.dbs.device.keyPair.put(this.key, newCryptoKey);
  }

  /**
   * Build the message listing the local actor's follows.
   *
   * @returns `Collection` with the `items` property listing the followed IDs.
   */
  async buildFollows(): Promise<MessageBodies> {
    const actorId = ChatterNet.actorFromDid(this.getLocalDid());
    // follow all followed IDs from the local store, and self
    const follows = [...new Set([...(await this.dbs.peer.follow.getAll()), actorId])];
    const message = await this.newMessage(follows, "Follow", []);
    return { message, bodies: [] };
  }

  /**
   * Build the message describing the local actor.
   *
   * @returns `Collection` with the `items` property listing the followed IDs.
   */
  async buildActor(): Promise<MessageBodies> {
    const actorId = ChatterNet.actorFromDid(this.getLocalDid());
    const actor = await Model.newActor(this.getLocalDid(), "Person", this.key, {
      name: this.getLocalName(),
    });
    const message = await this.newMessage([actorId], "Create", []);
    return { message, bodies: [actor] };
  }

  /**
   * Calculate a message's affinity to the local user's inbox.
   *
   * A messages should land in a user's inbox only if it's actor is a contact
   * of the local actor, and if it is addressed to an audience the local actor
   * belongs to.
   *
   * A server could return a message to an actor which does not belong to that
   * actor's inbox because of out-of-date data or non-compliance.
   */
  async buildMessageAffinity(message: Message): Promise<MessageAffinity> {
    const localFollows = await this.dbs.peer.follow.getAll();
    const localActor = ChatterNet.actorFromDid(this.getLocalDid());
    const fromContact = message.actor === localActor || new Set(localFollows).has(message.actor);
    const localAudience = ChatterNet.followersFromId(localActor);
    const localAudiences = new Set(localFollows.map((x) => ChatterNet.followersFromId(x)));
    const audiences = Model.getAudiences(message);
    let inAudience = false;
    for (const audience of audiences) {
      if (localAudience !== audience && !localAudiences.has(audience)) continue;
      inAudience = true;
      break;
    }
    return { fromContact, inAudience };
  }

  /**
   * Store a message and any of its provided bodies to the local store.
   *
   * @param messageBodies
   */
  async storeMessageBodies(messageBodies: MessageBodies) {
    await this.dbs.peer.message.put(messageBodies.message.id);
    await this.dbs.peer.document.put(messageBodies.message);
    for (const objectDoc of messageBodies.bodies) {
      await this.dbs.peer.document.put(objectDoc);
      await this.dbs.peer.messageBody.put(messageBodies.message.id, objectDoc.id);
    }
  }

  /**
   * Remove a message from the local store if present.
   *
   * @param messageId the message ID to remove
   */
  async deleteMessageLocal(messageId: string): Promise<void> {
    await this.dbs.peer.deletedMessage.put(messageId);
    await this.dbs.peer.message.delete(messageId);
    await this.dbs.peer.document.delete(messageId);
    const bodiesId = await this.dbs.peer.messageBody.getBodiesForMessage(messageId);
    this.dbs.peer.messageBody.deleteForMessage(messageId);
    for (const bodyId of bodiesId) {
      if (await this.dbs.peer.messageBody.hasMessageWithBody(bodyId)) continue;
      this.dbs.peer.document.delete(bodyId);
    }
  }

  /**
   * Check if a message ID is known to be deleted.
   *
   * @param messageId
   * @returns
   */
  async messageIsDeleted(messageId: string): Promise<boolean> {
    return await this.dbs.peer.deletedMessage.hasId(messageId);
  }

  /**
   * Post a message and any of its provided bodies to the servers.
   *
   * @param messageBodies the message and associated bodies to post
   */
  async postMessageObjectDoc(messageBodies: MessageBodies) {
    await this.servers.postMessage(messageBodies.message, this.getLocalDid());
    for (const objectDoc of messageBodies.bodies) await this.postObjectDoc(objectDoc);
  }

  /**
   * Post an object.
   *
   * @param objectDoc the object to post
   */
  async postObjectDoc(body: Body) {
    await this.servers.postDocument(body);
  }

  /**
   * Build and signs a new message.
   *
   * This is a local operation.
   *
   * @param ids list of message objects IDs
   * @param audience audiences to address the message to, defaults to local
   *   actor followers if none is provided
   * @returns the signed message
   */
  async newMessage(ids: string[], type: string, audience?: string[]): Promise<Message> {
    const did = this.getLocalDid();
    const actorId = ChatterNet.actorFromDid(did);
    const actorFollowers = ChatterNet.followersFromId(actorId);
    audience = audience ? audience : [actorFollowers];
    return await Model.newMessage(did, ids, type, null, this.key, { audience });
  }

  /**
   * Builds and signs a message indicating that another should be deleted. The
   * message to delete must be stored locally and be from the local actor.
   *
   * This is a local operation.
   *
   * @param ids list of message objects IDs
   * @param audience audiences to address the message to, defaults to local
   *   actor followers if none is provided
   * @returns the signed message
   */
  async newDelete(messageId: string, audience?: string[]): Promise<Message | undefined> {
    const message = await this.dbs.peer.document.get(messageId);
    const actorId = ChatterNet.actorFromDid(this.getLocalDid());
    if (!message) return;
    if (!Model.isMessage(message)) return;
    if (message.actor != actorId) return;
    return await this.newMessage([messageId], "Delete", audience);
  }

  /**
   * Build a new note.
   *
   * This is a local operation.
   *
   * @param content the string content of the note
   * @param audience audiences to address the message to, defaults to local
   *   actor followers if none is provided
   * @param mediaType mime type of the content
   * @returns
   */
  async newNote(content: string, audience?: string[], mediaType?: string): Promise<MessageBodies> {
    const note = await Model.newBody("Note", { content, mediaType });
    const message = await this.newMessage([note.id], "Create", audience);
    return { message, bodies: [note] };
  }

  /**
   * Build a new follow.
   *
   * This is a local operation.
   *
   * The resulting message will tell the network that the local actor is
   * following the given `id`. The server will add the local actor to the
   * `followers` collection of the given `id`.
   *
   * If the `id` is another actor, that actor will become a "contact" of the
   * local actor, meaning that the servers will route messages authored by `id`
   * to the local actor.
   *
   * @param id ID followed by the actor
   * @param audience audiences to address the message to, defaults to local
   *   actor followers and followed Id followers if none is provided
   * @returns the message and object to send
   */
  async newFollow(id: string, audience?: string[]): Promise<MessageBodies> {
    await this.dbs.peer.follow.put(id);
    const actorFollowers = ChatterNet.followersFromId(ChatterNet.actorFromDid(this.getLocalDid()));
    const idFollowers = ChatterNet.followersFromId(id);
    audience = audience ? audience : [actorFollowers, idFollowers];
    const message = await this.newMessage([id], "Follow", audience);
    return { message, bodies: [] };
  }

  /**
   * Build a new server listen message.
   *
   * This is a local operation.
   *
   * The resulting message will tell the network that the local actor is
   * listening to the server identified by `id` at the given `url`. Actors who
   * follow the local actor can make requests to this server to increase
   * their ability to get messages from the local actor.
   *
   * @param id ID of the listened server actor
   * @param audience audiences to address the message to, defaults to local
   *   actor followers and followers of the listened actor if none is provided
   * @returns the message and object to send
   */
  async newListen(did: string, audience?: string[]): Promise<MessageBodies> {
    const actorDid = this.getLocalDid();
    const actorActorId = ChatterNet.actorFromDid(actorDid);
    const actorFollowers = ChatterNet.followersFromId(actorActorId);
    audience = audience ? audience : [actorFollowers];
    const serverActorId = ChatterNet.actorFromDid(did);
    const message = await Model.newMessage(actorDid, [serverActorId], "Listen", null, this.key, {
      audience,
    });
    return { message, bodies: [] };
  }

  /**
   * Build a new view message.
   *
   * This is a local operation.
   *
   * The resulting message will tell the network that the local actor has viewed
   * a message, which then allows the followers of the local actor to find that
   * message.
   *
   * @param message the message viewed by the local actor
   * @param audience audiences to address the message to, defaults to local
   *   actor followers if none is provided
   * @returns the message and object to send
   */
  async getOrNewViewMessage(message: Message, audience?: string[]): Promise<Message | undefined> {
    // don't view messages from self
    const actorDid = this.getLocalDid();
    const actorId = ChatterNet.actorFromDid(actorDid);
    if (message.actor === actorId) return;
    // don't view indirect messages
    if (message.type === "View") return;

    // try first to get a previous view message
    const [objectId] = message.object;
    const prevView = await this.dbs.peer.viewMessage.get(objectId);
    if (prevView != null) return prevView;

    const actorFollowers = ChatterNet.followersFromId(actorId);
    audience = audience ? audience : [actorFollowers];
    const view = await Model.newMessage(actorDid, message.object, "View", null, this.key, {
      origin: message.id,
      audience,
    });
    await this.dbs.peer.viewMessage.put(view);
    return view;
  }

  /**
   * Add or update a server to the list of of servers known to the local actor.
   *
   * This is a local operation.
   *
   * If the server is relevant to the local actor, it might be connected to at
   * the next time the a client is built for the local actor.
   *
   * @param did the DID of the server
   * @param url the URL of the server
   * @param lastListenTimestamp the last timestamp at which a listen message
   *   has been emitted for this server
   */
  async addOrUpdateServer(did: string, url: string, lastListenTimestamp: number) {
    this.dbs.peer.server.update({ info: { url, did }, lastListenTimestamp });
  }

  /**
   * Get an object from the global network state.
   *
   * This will return the requested object from the first server able to serve
   * it, or undefined if no server has the object.
   *
   * @param id the actor ID
   * @returns the actor document
   */
  async getDocument(id: string): Promise<Model.WithId | undefined> {
    let document: Model.WithId | undefined = undefined;
    // try first from local store
    if (!document) document = await this.dbs.peer.document.get(id);
    // then from servers
    if (!document) document = await this.servers.getDocument(id);
    return document;
  }

  /**
   * Get an actor from the global network state.
   *
   * This will get a document and validate that it is a valid `Actor` object.
   * See `getObjectDoc` for more.
   *
   * @param id the actor ID
   * @returns the actor document
   */
  async getActor(id: string): Promise<Actor | undefined> {
    let actor: Model.WithId | undefined = await this.getDocument(id);
    if (!Model.isActor(actor)) return;
    if (!(await Model.verifyActor(actor))) return;
    return actor;
  }

  /**
   * Build a new message iterator for the local actor.
   *
   * This is an object which provides iteration over all inbox messages for
   * the local actor, pulled from all servers.
   *
   * @returns the message iterator
   */
  async buildMessageIter(): Promise<MessageIter> {
    return await MessageIter.new(this.getLocalDid(), this.servers, this.dbs.peer, 32);
  }

  /**
   * Get the DID for the local actor.
   * @returns the DID
   */
  getLocalDid(): string {
    return DidKey.didFromKey(this.key);
  }

  /**
   * Get the actor ID corresponding to a given DID.
   *
   * @param did the actor DID
   * @returns the actor ID
   */
  static actorFromDid(did: string): string {
    return `${did}/actor`;
  }

  /**
   * Get the followers collection ID corresponding to the given object ID.
   *
   * @param actorId the actor ID
   * @returns the followers collection ID
   */
  static followersFromId(actorId: string): string {
    return `${actorId}/followers`;
  }

  /**
   * Get the user name of the local actor.
   *
   * @returns the user name
   */
  getLocalName(): string {
    return this.name;
  }
}
