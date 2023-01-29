import * as DidKey from "./didkey.js";
import { MessageIter } from "./messageiter.js";
import type { Actor, Message, WithId } from "./model/index.js";
import * as Model from "./model/index.js";
import { PageIter } from "./pageiter.js";
import { Servers } from "./servers.js";
import type { Key } from "./signatures.js";
import * as Storage from "./storage.js";
import type { IdName } from "./storage.js";
import { getTimestamp } from "./utils.js";

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
export interface MessageDocuments {
  message: Message;
  documents: WithId[];
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
    await db.idName.putIfNewer({ id: did, name, timestamp: getTimestamp() });
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
   * List all known ID name pairs.
   *
   * @returns mapping of ID to name
   */
  static async getIdToName(): Promise<Map<string, string>> {
    const db = await Storage.DbDevice.new();
    return new Map(
      (await db.idName.getAll()).filter(({ name }) => !!name).map(({ id, name }) => [id, name!])
    );
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
    if (!name) throw Error("there is no name for the given DID");

    // find the servers this actor should listen to
    const peer = await Storage.DbPeer.new(`Peer_${did}`);
    const peerServers = await peer.server.getByLastListen();
    const servers = Servers.fromInfos([...peerServers, ...defaultServers]);
    const chatterNet = new ChatterNet(name, key, { device, peer }, servers);

    // tell the server about the user name
    const actorMessageDocuments = await chatterNet.buildActor();
    chatterNet.storeMessageDocuments(actorMessageDocuments);
    chatterNet.postMessageDocuments(actorMessageDocuments).catch(() => {});
    // tell the server about the actor follows
    (async () => {
      await chatterNet.postMessageDocuments(await chatterNet.buildClearFollows());
      await chatterNet.postMessageDocuments(await chatterNet.buildSetFollows());
    })().catch(() => {});

    return chatterNet;
  }

  /**
   * Change the user name.
   *
   * This is a local operation.
   *
   * @param name the new user name
   */
  async changeName(name: string): Promise<MessageDocuments> {
    this.name = name;
    await this.dbs.device.idName.put({ id: this.getLocalDid(), name, timestamp: getTimestamp() });
    return await this.buildActor();
  }

  /**
   * Update ID name if it is already in the local store and newer than the
   * existing entry.
   *
   * ID names are added when an ID is followed. This method can then be used
   * to keep the names up-to-date.
   *
   * @param idName the ID name to update
   */
  async updateIdName(idName: IdName) {
    await this.dbs.device.idName.updateIfNewer(idName);
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
   * Build the message clearing all of the local actor's follows on the server
   * handling the message.
   *
   * This message has no audience and will not propagate. It will affect only
   * the state of the servers it is directly sent to.
   */
  async buildClearFollows(): Promise<MessageDocuments> {
    const did = this.getLocalDid();
    const actorId = ChatterNet.actorFromDid(did);
    const target = [`${actorId}/following`];
    const message = await Model.newMessage(did, target, "Delete", null, this.key);
    return { message, documents: [] };
  }

  /**
   * Build the message setting all of the local actor's follows on the server
   * handling the message.
   *
   * This message has no audience and will not propagate. It will affect only
   * the state of the servers it is directly sent to.
   */
  async buildSetFollows(): Promise<MessageDocuments> {
    const did = this.getLocalDid();
    const actorId = ChatterNet.actorFromDid(did);
    const ids = [...new Set([...(await this.dbs.peer.follow.getAll()), actorId])];
    const target = [`${actorId}/following`];
    const message = await Model.newMessage(did, ids, "Add", null, this.key, { target });
    return { message, documents: [] };
  }

  /**
   * Build the message describing the local actor.
   */
  async buildActor(): Promise<MessageDocuments> {
    const actorId = ChatterNet.actorFromDid(this.getLocalDid());
    const to = [ChatterNet.followersFromId(actorId)];
    const actor = await Model.newActor(this.getLocalDid(), "Person", this.key, {
      name: this.getLocalName(),
    });
    const message = await this.newMessage([actorId], "Create", to);
    return { message, documents: [actor] };
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
   * Store a message and any of its provided documents to the local store.
   *
   * @param messageDocuments
   */
  async storeMessageDocuments(messageDocuments: MessageDocuments) {
    await this.dbs.peer.message.put(messageDocuments.message.id);
    await this.dbs.peer.document.put(messageDocuments.message);
    for (const document of messageDocuments.documents) {
      await this.dbs.peer.document.put(document);
      await this.dbs.peer.messageDocument.put(messageDocuments.message.id, document.id);
    }
  }

  /**
   * Remove a message or document from the local store if present.
   *
   * @param id the document ID to remove
   */
  async deleteLocalId(id: string, forceDeleteObjects: boolean = false): Promise<void> {
    await this.dbs.peer.deleted.put(id);
    await this.dbs.peer.message.delete(id);
    await this.dbs.peer.document.delete(id);
    const documentsId = await this.dbs.peer.messageDocument.getDocumentsForMessage(id);
    this.dbs.peer.messageDocument.deleteForMessage(id);
    for (const documentId of documentsId) {
      if (
        !forceDeleteObjects &&
        (await this.dbs.peer.messageDocument.hasMessageWithDocument(documentId))
      )
        continue;
      this.dbs.peer.document.delete(documentId);
    }
  }

  /**
   * Check if a message ID is known to be deleted.
   *
   * @param messageId
   * @returns
   */
  async isDeleted(id: string): Promise<boolean> {
    return await this.dbs.peer.deleted.hasId(id);
  }

  /**
   * Post a message and any of its provided documents to the servers.
   *
   * @param messageDocuments the message and associated documents to post
   */
  async postMessageDocuments(messageDocuments: MessageDocuments) {
    await this.servers.postMessage(messageDocuments.message, this.getLocalDid());
    for (const objectDoc of messageDocuments.documents) await this.postDocument(objectDoc);
  }

  /**
   * Post a document.
   *
   * @param document the document
   */
  async postDocument(document: WithId) {
    await this.servers.postDocument(document);
  }

  /**
   * Build a list containing just the local actor's document. Useful for
   * sending a new message addressed to the local actor's followers.
   *
   * @returns a list with the local actor's document
   */
  async toSelf(): Promise<Model.WithId[]> {
    const actor = await Model.newActor(this.getLocalDid(), "Person", this.key, {
      name: this.getLocalName(),
    });
    return [actor];
  }

  /**
   * Build and signs a new message.
   *
   * This is a local operation.
   *
   * @param ids list of message objects IDs
   * @param to other followers collections to add to the audience
   * @returns the signed message
   */
  async newMessage(ids: string[], type: string, to: string[]): Promise<Message> {
    const did = this.getLocalDid();
    return await Model.newMessage(did, ids, type, null, this.key, { to });
  }

  /**
   * Builds and signs a message indicating that another should be deleted. The
   * message to delete must be stored locally and be from the local actor.
   *
   * This is a local operation.
   *
   * Sends to followers of the local actor and followers of the object.
   *
   * Note that if the object is neither a message by the local actor, nor a
   * document attributed to the local actor, the resulting message will be
   * invalid and rejected by compliant servers.
   *
   * @param ids list of message objects IDs
   * @returns the signed message
   */
  async newDelete(id: string): Promise<Message> {
    const did = this.getLocalDid();
    const actorId = ChatterNet.actorFromDid(did);
    const actorFollowers = ChatterNet.followersFromId(actorId);
    const objectsFollowers = `${id}/followers}`;
    const to = [actorFollowers, objectsFollowers];
    return await this.newMessage([id], "Delete", to);
  }

  /**
   * Build a new note.
   *
   * This is a local operation.
   *
   * @param content the string content of the note
   * @param toDocuments the documents whose followers are the audience
   * @param mediaType mime type of the content
   * @param inReplyTo URI of message this is in reply to
   * @returns
   */
  async newNote(
    content: string,
    toDocuments: Model.WithId[],
    inReplyTo?: string
  ): Promise<MessageDocuments> {
    const did = this.getLocalDid();
    const attributedTo = ChatterNet.actorFromDid(did);
    const note = await Model.newNoteMd1k(content, attributedTo, { inReplyTo });
    const to = toDocuments.map((x) => ChatterNet.followersFromId(x.id));
    const message = await this.newMessage([note.id], "Create", to);
    return { message, documents: [note, ...toDocuments] };
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
   * This message has no audience and will not propagate. It will affect only
   * the state of the servers it is directly sent to.
   *
   * @param idName the information about the ID to follow
   * @returns the message and object to send
   */
  async newFollow(idName: IdName): Promise<MessageDocuments> {
    await this.dbs.peer.follow.put(idName.id);
    if (idName.name) await this.dbs.peer.idName.putIfNewer(idName);
    const did = this.getLocalDid();
    const actorId = ChatterNet.actorFromDid(did);
    const target = [`${actorId}/following`];
    const message = await Model.newMessage(did, [idName.id], "Add", null, this.key, { target });
    return { message, documents: [] };
  }

  /**
   * Build a new un-follow.
   *
   * This is a local operation.
   *
   * The resulting message will tell the network that the local actor is
   * no longer following the given `id`. The server will remove the local
   * actor from the `followers` collection of the given `id`.
   *
   * This message has no audience and will not propagate. It will affect only
   * the state of the servers it is directly sent to.
   *
   * @param id ID followed by the actor
   * @returns the message and object to send
   */
  async newUnfollow(id: string): Promise<MessageDocuments> {
    await this.dbs.peer.follow.delete(id);
    const did = this.getLocalDid();
    const actorId = ChatterNet.actorFromDid(did);
    const target = [`${actorId}/following`];
    const message = await Model.newMessage(did, [id], "Remove", null, this.key, { target });
    return { message, documents: [] };
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
   * @returns the message and object to send
   */
  async newListen(did: string): Promise<MessageDocuments> {
    const actorDid = this.getLocalDid();
    const actorActorId = ChatterNet.actorFromDid(actorDid);
    const actorFollowers = ChatterNet.followersFromId(actorActorId);
    const to = [actorFollowers];
    const serverActorId = ChatterNet.actorFromDid(did);
    const message = await Model.newMessage(actorDid, [serverActorId], "Listen", null, this.key, {
      to,
    });
    return { message, documents: [] };
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
   * @returns the message and object to send
   */
  async getOrNewViewMessage(message: Message): Promise<Message | undefined> {
    // don't view messages from self
    const actorDid = this.getLocalDid();
    const actorId = ChatterNet.actorFromDid(actorDid);
    if (message.actor === actorId) return;
    // don't view indirect messages
    if (message.type === "View") return;

    // try first to get a previous view message
    const [objectId] = message.object;
    const previousView = await this.dbs.peer.viewMessage.get(objectId);
    if (previousView != null) return previousView;

    const view = await Model.newMessage(actorDid, message.object, "View", null, this.key, {
      origin: [message.id],
      to: message.to,
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
  async getDocument(id: string): Promise<WithId | undefined> {
    if (await this.isDeleted(id)) return undefined;
    let document: WithId | undefined = undefined;
    // try first from local store
    if (!document) document = await this.dbs.peer.document.get(id);
    // then from servers
    if (!document) document = await this.servers.getDocument(id);
    return document;
  }

  /**
   * Get an object from the global network state.
   *
   * The mapping of object to message is not maintained locally, so this
   * requires a request to the servers.
   *
   * @param id the actor ID
   * @param actorId the ID of the actor which created the message
   * @returns the create message
   */
  async getCreateMessageForDocument(id: string, actorId: string): Promise<Message | undefined> {
    const message = await this.servers.getCreateMessageForDocument(id, actorId);
    return message;
  }

  /**
   * Get an actor from the global network state.
   *
   * This will get a document and validate that it is a valid `Actor` object.
   * See `getDocument` for more.
   *
   * @param id the actor ID
   * @returns the actor document
   */
  async getActor(id: string): Promise<Actor | undefined> {
    let actor: WithId | undefined = await this.getDocument(id);
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
  buildMessageIter(): MessageIter {
    const uri = `${this.getLocalDid()}/actor/inbox`;
    const pageIter = PageIter.new<Model.Message>(uri, this.servers, 32, Model.isMessage);
    return new MessageIter(this.dbs.peer, pageIter);
  }

  /**
   * Build a new message iterator for the local actor iterating over only
   * messages from actor `actor_id`.
   *
   * See to [`buildMessageIter`].
   *
   * @returns the message iterator
   */
  buildMessageIterFrom(actorId: string): MessageIter {
    const uri = `${this.getLocalDid()}/actor/inbox/from/${actorId}`;
    const pageIter = PageIter.new<Model.Message>(uri, this.servers, 32, Model.isMessage);
    return new MessageIter(this.dbs.peer, pageIter);
  }

  /**
   * Build a new iterator over followers.
   *
   * This is an object which provides iteration over all followers of the local
   * actor, pulled from all servers.
   *
   * @returns the followers iterator
   */
  buildFollowersIter(): PageIter<string> {
    const uri = `${this.getLocalDid()}/actor/followers`;
    const isString = function (x: unknown): x is string {
      return typeof x === "string";
    };
    return PageIter.new<string>(uri, this.servers, 32, isString);
  }

  /**
   * Build a new tag and stores the mapping of its ID to its name.
   *
   * @param name the tag name
   * @returns the `Model.Tag30` object
   */
  async buildTag(name: string): Promise<Model.Tag30> {
    const tag = await Model.newTag30(name);
    return tag;
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
   * @param id the document ID
   * @returns the followers collection ID
   */
  static followersFromId(id: string): string {
    return `${id}/followers`;
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
