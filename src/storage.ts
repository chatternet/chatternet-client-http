import { didFromKey } from "./didkey.js";
import type { Key } from "./signatures.js";
import { Ed25519VerificationKey2020 } from "@digitalbazaar/ed25519-verification-key-2020";
import { IDBPDatabase, openDB } from "idb/with-async-ittr";

export interface IdName {
  id: string;
  name: string;
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
  url: string;
  lastListenTimestamp: number;
}

class StoreServer {
  static DEFAULT_NAME = "Server";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreServer.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreServer.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "url" }).createIndex(
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
    const prev: RecordServer | undefined = await transaction.store.get(record.url);
    await transaction.store.put({ ...prev, ...record });
  }

  async get(url: string): Promise<RecordServer | undefined> {
    const transaction = this.db.transaction(this.name, "readonly");
    return await transaction.store.get(url);
  }

  async getUrlsByLastListen(count?: number): Promise<string[]> {
    const transaction = this.db.transaction(this.name, "readonly");
    let urls: string[] = [];
    for await (const cursor of transaction.store
      .index("lastListenTimestamp")
      .iterate(null, "prev")) {
      const record: RecordServer = cursor.value;
      urls.push(record.url);
      if (count && urls.length >= count) break;
    }
    return urls;
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
    let storeIdSalt = undefined;
    let storeKeyPair = undefined;
    let storeIdName = undefined;
    const db = await openDB(name, 1, {
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

  constructor(readonly db: IDBPDatabase, readonly server: StoreServer) {}

  static async new(name: string = DbPeer.DEFAULT_NAME): Promise<DbPeer> {
    let storeServer = undefined;
    const db = await openDB(name, 1, {
      upgrade: (db) => {
        storeServer = StoreServer.create(db);
      },
    });
    storeServer = storeServer ? storeServer : new StoreServer(db);
    return new DbPeer(db, storeServer);
  }

  async clear() {
    await this.server.clear();
  }
}
