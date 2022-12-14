import { didFromKey } from "./didkey.js";
import type { Model } from "./index.js";
import type { Key } from "./signatures.js";
import { Ed25519VerificationKey2020 } from "@digitalbazaar/ed25519-verification-key-2020";
import { IDBPDatabase, openDB } from "idb/with-async-ittr";

const DB_VERSION = 2;

export interface IdName {
  id: string;
  name: string;
}

export interface ServerInfo {
  url: string;
  did: string;
}

export async function cryptoKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export interface RecordIdSalt {
  id: string;
  salt: Uint8Array;
}

class StoreIdSalt {
  static DEFAULT_NAME = "IdSalt";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreIdSalt.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreIdSalt.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "id" });
    return new StoreIdSalt(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async getPut(id: string): Promise<Uint8Array> {
    const transaction = this.db.transaction(this.name, "readwrite");
    const prevRecord: RecordIdSalt | undefined = await transaction.store.get(id);
    if (prevRecord) return prevRecord.salt;
    const salt = window.crypto.getRandomValues(new Uint8Array(32));
    const record: RecordIdSalt = { id, salt };
    await transaction.store.put(record);
    return salt;
  }
}

interface RecordKeyPair {
  did: string;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
}

class StoreKeyPair {
  static DEFAULT_NAME = "KeyPair";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreKeyPair.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreKeyPair.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "did" });
    return new StoreKeyPair(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async put(key: Key, cryptoKey: CryptoKey) {
    const did = didFromKey(key);
    const exported = key.export({ publicKey: true, privateKey: true });
    const plaintext = new TextEncoder().encode(JSON.stringify(exported));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      plaintext
    );
    const transaction = this.db.transaction(this.name, "readwrite");
    const record: RecordKeyPair = { did, ciphertext, iv };
    await transaction.store.put(record);
  }

  async get(did: string, cryptoKey: CryptoKey): Promise<Key | undefined> {
    const transaction = this.db.transaction(this.name, "readonly");
    const record: RecordKeyPair | undefined = await transaction.store.get(did);
    if (!record) return;
    try {
      const plaintext = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: record.iv },
        cryptoKey,
        record.ciphertext
      );
      const exported = JSON.parse(new TextDecoder().decode(plaintext));
      const key = await Ed25519VerificationKey2020.from(exported);
      return key;
    } catch {
      return undefined;
    }
  }

  async getDids(): Promise<string[]> {
    const transaction = this.db.transaction(this.name, "readonly");
    return (await transaction.store.getAllKeys()) as string[];
  }
}

type RecordIdName = IdName;

class StoreIdName {
  static DEFAULT_NAME = "IdName";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreIdName.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreIdName.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "id" }).createIndex("name", "name");
    return new StoreIdName(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async put(id: string, name: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const record: RecordIdName = { id, name };
    await transaction.store.put(record);
  }

  async get(id: string): Promise<IdName | undefined> {
    const transaction = this.db.transaction(this.name, "readonly");
    const idName: RecordIdName | undefined = await transaction.store.get(id);
    return idName;
  }

  async getAll(): Promise<IdName[]> {
    const transaction = this.db.transaction(this.name, "readonly");
    return await transaction.store.getAll();
  }
}

interface RecordServer {
  info: ServerInfo;
  lastListenTimestamp: number;
}

class StoreServer {
  static DEFAULT_NAME = "Server";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreServer.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreServer.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "info.url" }).createIndex(
      "lastListenTimestamp",
      "lastListenTimestamp"
    );
    return new StoreServer(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async update(record: RecordServer) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const prev: RecordServer | undefined = await transaction.store.get(record.info.url);
    await transaction.store.put({ ...prev, ...record });
  }

  async getByLastListen(count?: number): Promise<ServerInfo[]> {
    const transaction = this.db.transaction(this.name, "readonly");
    let serversInfo: ServerInfo[] = [];
    for await (const cursor of transaction.store
      .index("lastListenTimestamp")
      .iterate(null, "prev")) {
      const record: RecordServer = cursor.value;
      serversInfo.push(record.info);
      if (count && serversInfo.length >= count) break;
    }
    return serversInfo;
  }
}

interface RecordFollow {
  id: string;
}

class StoreFollow {
  static DEFAULT_NAME = "Follow";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreFollow.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreFollow.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "id" });
    return new StoreFollow(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async put(id: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const record: RecordFollow = { id };
    await transaction.store.put(record);
  }

  async get(url: string): Promise<RecordFollow | undefined> {
    const transaction = this.db.transaction(this.name, "readonly");
    return await transaction.store.get(url);
  }

  async getAll(): Promise<string[]> {
    const transaction = this.db.transaction(this.name, "readonly");
    return (await transaction.store.getAll()).map((x) => x.id);
  }
}

interface RecordMessageId {
  id: string;
  idx: number;
}

interface PageOut {
  ids: string[];
  nextStartIdx?: number;
}

class StoreMessage {
  static DEFAULT_NAME = "Message";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreMessage.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreMessage.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "idx", autoIncrement: true }).createIndex("id", "id");
    return new StoreMessage(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async delete(id: string): Promise<void> {
    const transaction = this.db.transaction(this.name, "readwrite");
    const key = await transaction.store.index("id").getKey(id);
    if (key == null) return;
    await transaction.store.delete(key);
  }

  async put(id: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    await transaction.store.put({ id });
  }

  async getPage(startIdx?: number, pageSize: number = 32): Promise<PageOut> {
    const transaction = this.db.transaction(this.name, "readwrite");
    let query = startIdx != null ? IDBKeyRange.upperBound(startIdx, false) : undefined;
    let nextStartIdx: number | undefined = undefined;
    const ids: string[] = [];
    for await (const cursor of transaction.store.iterate(query, "prevunique")) {
      const record: RecordMessageId = cursor.value;
      ids.push(record.id);
      nextStartIdx = nextStartIdx ? Math.min(record.idx, nextStartIdx) : record.idx;
      if (ids.length >= pageSize) break;
    }
    nextStartIdx = nextStartIdx != null && nextStartIdx > 0 ? nextStartIdx - 1 : undefined;
    return { ids, nextStartIdx };
  }
}

interface RecordDocument {
  document: Model.WithId;
}

class StoreDocument {
  static DEFAULT_NAME = "Document";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreDocument.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreDocument.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "document.id" });
    return new StoreDocument(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async get(id: string): Promise<Model.WithId | undefined> {
    const transaction = this.db.transaction(this.name, "readonly");
    const record: RecordDocument | undefined = await transaction.store.get(id);
    return !!record ? record.document : undefined;
  }

  async delete(id: string): Promise<void> {
    const transaction = this.db.transaction(this.name, "readwrite");
    await transaction.store.delete(id);
  }

  async put(document: Model.WithId) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const record: RecordDocument = { document };
    await transaction.store.put(record);
  }
}

interface RecordViewMessage {
  message: Model.Message;
  objectId: string;
}

/**
 * Stores a single view message for any object ID.
 */
class StoreViewMessage {
  static DEFAULT_NAME = "ViewMessage";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreViewMessage.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreViewMessage.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "objectId" });
    return new StoreViewMessage(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async get(objectId: string): Promise<Model.Message | undefined> {
    const transaction = this.db.transaction(this.name, "readonly");
    const record: RecordViewMessage | undefined = await transaction.store.get(objectId);
    return record?.message;
  }

  async put(message: Model.Message) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const record: RecordViewMessage = { message, objectId: message.object[0] };
    await transaction.store.put(record);
  }
}

interface RecordMessageBody {
  jointId: string;
  messageId: string;
  bodyId: string;
}

/**
 * Stores a single view message for any object ID.
 */
class StoreMessageBody {
  static DEFAULT_NAME = "MessageBody";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreMessageBody.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreMessageBody.DEFAULT_NAME) {
    const store = db.createObjectStore(name, { keyPath: "jointId" });
    store.createIndex("bodyId", "bodyId");
    store.createIndex("messageId", "messageId");
    return new StoreMessageBody(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async hasMessageWithBody(bodyId: string): Promise<boolean> {
    const transaction = this.db.transaction(this.name, "readonly");
    return (await transaction.store.index("bodyId").count(bodyId)) > 0;
  }

  async getBodiesForMessage(messageId: string): Promise<string[]> {
    const transaction = this.db.transaction(this.name, "readonly");
    return (await transaction.store.index("messageId").getAll(messageId)).map((x) => x.bodyId);
  }

  async deleteForMessage(messageId: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const keys = await transaction.store.index("messageId").getAllKeys(messageId);
    for (const key of keys) transaction.store.delete(key);
  }

  async delete(messageId: string, bodyId: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const jointId = JSON.stringify([messageId, bodyId]);
    await transaction.store.delete(jointId);
  }

  async put(messageId: string, bodyId: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const jointId = JSON.stringify([messageId, bodyId]);
    const record: RecordMessageBody = { jointId, messageId, bodyId };
    await transaction.store.put(record);
  }
}

/**
 * Stores unique document IDs.
 */
class StoreDocumentId {
  static DEFAULT_NAME = "DocumentId";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreDocumentId.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreDocumentId.DEFAULT_NAME) {
    // store plain IDs, specify ID as key when putting, so no key path here
    db.createObjectStore(name);
    return new StoreDocumentId(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async hasId(id: string): Promise<boolean> {
    const transaction = this.db.transaction(this.name, "readonly");
    return (await transaction.store.count(id)) > 0;
  }

  async delete(id: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    await transaction.store.delete(id);
  }

  async put(id: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    // use the ID as the key
    await transaction.store.put(id, id);
  }
}

export class DbDevice {
  static DEFAULT_NAME = "Device";

  constructor(
    readonly db: IDBPDatabase,
    readonly idSalt: StoreIdSalt,
    readonly keyPair: StoreKeyPair,
    readonly idName: StoreIdName
  ) {}

  static async new(name: string = DbDevice.DEFAULT_NAME): Promise<DbDevice> {
    let storeIdSalt: StoreIdSalt | undefined = undefined;
    let storeKeyPair: StoreKeyPair | undefined = undefined;
    let storeIdName: StoreIdName | undefined = undefined;
    const db = await openDB(name, DB_VERSION, {
      upgrade: (db) => {
        storeIdSalt = StoreIdSalt.create(db);
        storeKeyPair = StoreKeyPair.create(db);
        storeIdName = StoreIdName.create(db);
      },
    });
    storeIdSalt = storeIdSalt ? storeIdSalt : new StoreIdSalt(db);
    storeKeyPair = storeKeyPair ? storeKeyPair : new StoreKeyPair(db);
    storeIdName = storeIdName ? storeIdName : new StoreIdName(db);
    return new DbDevice(db, storeIdSalt, storeKeyPair, storeIdName);
  }

  async clear() {
    await this.idSalt.clear();
    await this.keyPair.clear();
    await this.idName.clear();
  }
}

export class DbPeer {
  static DEFAULT_NAME = "Peer";

  constructor(
    readonly db: IDBPDatabase,
    readonly server: StoreServer,
    readonly follow: StoreFollow,
    readonly message: StoreMessage,
    readonly document: StoreDocument,
    readonly messageBody: StoreMessageBody,
    readonly viewMessage: StoreViewMessage,
    readonly deletedMessage: StoreDocumentId
  ) {}

  static async new(name: string = DbPeer.DEFAULT_NAME): Promise<DbPeer> {
    let storeServer: StoreServer | undefined = undefined;
    let storeFollow: StoreFollow | undefined = undefined;
    let storeMessage: StoreMessage | undefined = undefined;
    let storeDocument: StoreDocument | undefined = undefined;
    let storeMessageBody: StoreMessageBody | undefined = undefined;
    let storeViewMessage: StoreViewMessage | undefined = undefined;
    let storeDeletedMessage: StoreDocumentId | undefined = undefined;
    const db = await openDB(name, DB_VERSION, {
      upgrade: (db) => {
        storeServer = StoreServer.create(db);
        storeFollow = StoreFollow.create(db);
        storeMessage = StoreMessage.create(db);
        storeDocument = StoreDocument.create(db);
        storeMessageBody = StoreMessageBody.create(db);
        storeViewMessage = StoreViewMessage.create(db);
        storeDeletedMessage = StoreDocumentId.create(db, "DeletedMessage");
      },
    });
    storeServer = storeServer ? storeServer : new StoreServer(db);
    storeFollow = storeFollow ? storeFollow : new StoreFollow(db);
    storeMessage = storeMessage ? storeMessage : new StoreMessage(db);
    storeDocument = storeDocument ? storeDocument : new StoreDocument(db);
    storeMessageBody = storeMessageBody ? storeMessageBody : new StoreMessageBody(db);
    storeViewMessage = storeViewMessage ? storeViewMessage : new StoreViewMessage(db);
    storeDeletedMessage = storeDeletedMessage
      ? storeDeletedMessage
      : new StoreDocumentId(db, "DeletedMessage");
    return new DbPeer(
      db,
      storeServer,
      storeFollow,
      storeMessage,
      storeDocument,
      storeMessageBody,
      storeViewMessage,
      storeDeletedMessage
    );
  }

  async clear() {
    await this.server.clear();
    await this.follow.clear();
    await this.message.clear();
    await this.document.clear();
    await this.messageBody.clear();
    await this.viewMessage.clear();
    await this.deletedMessage.clear();
  }
}
