import { didFromKey } from "./didkey.js";
import type { Key } from "./signatures.js";
import { Ed25519VerificationKey2020 } from "@digitalbazaar/ed25519-verification-key-2020";
import { IDBPDatabase, openDB } from "idb/with-async-ittr";

export interface IdNameSuffix {
  id: string;
  name: string;
  suffix: string;
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

export function buildSuffix(fullSuffix: string, suffixes: string[], minLength: number = 0): string {
  let suffixLength = minLength;
  let suffix: string = fullSuffix.slice(0, suffixLength);
  for (const other of suffixes) {
    while (suffix === other && suffixLength < fullSuffix.length) {
      suffixLength += 1;
      suffix = fullSuffix.slice(0, suffixLength);
    }
  }
  return suffix;
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
    const plaintext = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      cryptoKey,
      record.ciphertext
    );
    const exported = JSON.parse(new TextDecoder().decode(plaintext));
    return await Ed25519VerificationKey2020.from(exported);
  }
}

interface RecordIdNameSuffix {
  did: string;
  name: string;
  suffix: string;
}

class StoreIdNameSuffix {
  static DEFAULT_NAME = "IdNameSuffix";

  constructor(readonly db: IDBPDatabase, readonly name: string = StoreIdNameSuffix.DEFAULT_NAME) {}

  static create(db: IDBPDatabase, name: string = StoreIdNameSuffix.DEFAULT_NAME) {
    db.createObjectStore(name, { keyPath: "did" }).createIndex("name", "name");
    return new StoreIdNameSuffix(db, name);
  }

  async clear() {
    await this.db.transaction(this.name, "readwrite").store.clear();
  }

  async put(did: string, name: string) {
    const transaction = this.db.transaction(this.name, "readwrite");
    const others: RecordIdNameSuffix[] = await transaction.store.index("name").getAll(name);
    const fullSuffix = did.split("").reverse().join("");
    const suffix = buildSuffix(
      fullSuffix,
      others.filter((x) => x.did !== did).map((x) => x.suffix)
    );
    const record: RecordIdNameSuffix = { did, name, suffix };
    await transaction.store.put(record);
  }

  async get(did: string): Promise<IdNameSuffix | undefined> {
    const transaction = this.db.transaction(this.name, "readonly");
    const nameSuffix: RecordIdNameSuffix | undefined = await transaction.store.get(did);
    if (!nameSuffix) return;
    return { id: did, name: nameSuffix.name, suffix: nameSuffix.suffix };
  }

  async getAll(): Promise<IdNameSuffix[]> {
    const transaction = this.db.transaction(this.name, "readonly");
    return (await transaction.store.getAll()).map((x) => ({
      id: x.did,
      name: x.name,
      suffix: x.suffix,
    }));
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
    readonly idNameSuffix: StoreIdNameSuffix
  ) {}

  static async new(name: string = DbDevice.DEFAULT_NAME): Promise<DbDevice> {
    let storeIdSalt = undefined;
    let storeKeyPair = undefined;
    let storeNameSuffix = undefined;
    const db = await openDB(name, 1, {
      upgrade: (db) => {
        storeIdSalt = StoreIdSalt.create(db);
        storeKeyPair = StoreKeyPair.create(db);
        storeNameSuffix = StoreIdNameSuffix.create(db);
      },
    });
    storeIdSalt = storeIdSalt ? storeIdSalt : new StoreIdSalt(db);
    storeKeyPair = storeKeyPair ? storeKeyPair : new StoreKeyPair(db);
    storeNameSuffix = storeNameSuffix ? storeNameSuffix : new StoreIdNameSuffix(db);
    return new DbDevice(db, storeIdSalt, storeKeyPair, storeNameSuffix);
  }

  async clear() {
    await this.idSalt.clear();
    await this.keyPair.clear();
    await this.idNameSuffix.clear();
  }
}

export class DbPeer {
  static DEFAULT_NAME = "Peer";

  constructor(
    readonly db: IDBPDatabase,
    readonly idNameSuffix: StoreIdNameSuffix,
    readonly server: StoreServer
  ) {}

  static async new(name: string = DbPeer.DEFAULT_NAME): Promise<DbPeer> {
    let storeNameSuffix = undefined;
    let storeServer = undefined;
    const db = await openDB(name, 1, {
      upgrade: (db) => {
        storeNameSuffix = StoreIdNameSuffix.create(db);
        storeServer = StoreServer.create(db);
      },
    });
    storeNameSuffix = storeNameSuffix ? storeNameSuffix : new StoreIdNameSuffix(db);
    storeServer = storeServer ? storeServer : new StoreServer(db);
    return new DbPeer(db, storeNameSuffix, storeServer);
  }

  async clear() {
    await this.idNameSuffix.clear();
    await this.server.clear();
  }
}
