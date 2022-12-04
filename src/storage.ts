import { didFromKey } from "./didkey.js";
import type { Messages } from "./index.js";
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
  idx?: number;
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

  async put(id: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const record: RecordMessageId = { id };
    await transaction.store.put(record);
  }

  async getPage(after?: string, pageSize: number = 32): Promise<string[]> {
    const transaction = this.db.transaction(this.name, "readwrite");
    let query = null;
    if (after != null) {
      const cursor = await transaction.store.index("id").getKey(after);
      if (!cursor) return [];
      query = IDBKeyRange.upperBound(cursor, true);
    }
    const ids: string[] = [];
    for await (const cursor of transaction.store.iterate(query, "prevunique")) {
      const record: RecordMessageId = cursor.value;
      ids.push(record.id);
      if (ids.length >= pageSize) break;
    }
    return ids;
  }
}

interface RecordObjectDoc {
  objectDoc: Messages.ObjectDocWithId;
}

class StoreObjectDoc {
  static DEFAULT_NAME = "ObjectDoc";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreObjectDoc.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreObjectDoc.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "objectDoc.id" });
    return new StoreObjectDoc(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async get(id: string): Promise<Messages.ObjectDocWithId | undefined> {
    const transaction = this.db.transaction(this.name, "readonly");
    const record: RecordObjectDoc | undefined = await transaction.store.get(id);
    return !!record ? record.objectDoc : undefined;
  }

  async put(objectDoc: Messages.ObjectDocWithId) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const record: RecordObjectDoc = { objectDoc };
    await transaction.store.put(record);
  }
}

interface RecordViewMessage {
  message: Messages.MessageWithId;
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

  async get(objectId: string): Promise<Messages.MessageWithId | undefined> {
    const transaction = this.db.transaction(this.name, "readonly");
    const record: RecordViewMessage | undefined = await transaction.store.get(objectId);
    return record?.message;
  }

  async put(message: Messages.MessageWithId) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const record: RecordViewMessage = { message, objectId: message.object[0] };
    await transaction.store.put(record);
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
    readonly objectDoc: StoreObjectDoc,
    readonly viewMessage: StoreViewMessage
  ) {}

  static async new(name: string = DbPeer.DEFAULT_NAME): Promise<DbPeer> {
    let storeServer: StoreServer | undefined = undefined;
    let storeFollow: StoreFollow | undefined = undefined;
    let storeMessage: StoreMessage | undefined = undefined;
    let storeObjectDoc: StoreObjectDoc | undefined = undefined;
    let storeViewMessage: StoreViewMessage | undefined = undefined;
    const db = await openDB(name, DB_VERSION, {
      upgrade: (db) => {
        storeServer = StoreServer.create(db);
        storeFollow = StoreFollow.create(db);
        storeMessage = StoreMessage.create(db);
        storeObjectDoc = StoreObjectDoc.create(db);
        storeViewMessage = StoreViewMessage.create(db);
      },
    });
    storeServer = storeServer ? storeServer : new StoreServer(db);
    storeFollow = storeFollow ? storeFollow : new StoreFollow(db);
    storeMessage = storeMessage ? storeMessage : new StoreMessage(db);
    storeObjectDoc = storeObjectDoc ? storeObjectDoc : new StoreObjectDoc(db);
    storeViewMessage = storeViewMessage ? storeViewMessage : new StoreViewMessage(db);
    return new DbPeer(db, storeServer, storeFollow, storeMessage, storeObjectDoc, storeViewMessage);
  }

  async clear() {
    await this.server.clear();
    await this.follow.clear();
    await this.message.clear();
    await this.objectDoc.clear();
    await this.viewMessage.clear();
  }
}
