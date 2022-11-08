import * as DidKey from "./didkey.js";
import * as Storage from "./storage.js";

interface Dbs {
  device: Storage.DbDevice;
  peer: Storage.DbPeer;
}

export class ChatterNet {
  constructor(readonly dbs: Dbs) {}

  static async newAccount(name: string, password: string): Promise<string> {
    const db = await Storage.DbDevice.new();
    const key = await DidKey.newKey();
    const did = DidKey.didFromKey(key);
    const salt = await db.idSalt.getPut(did);
    const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
    await db.keyPair.put(key, cryptoKey);
    await db.nameSuffix.put(did, name);
    return did;
  }

  static async new(did: string, password: string): Promise<ChatterNet> {
    const device = await Storage.DbDevice.new();

    const salt = await device.idSalt.getPut(did);
    const cryptoKey = await Storage.cryptoKeyFromPassword(password, salt);
    const key = await device.keyPair.get(did, cryptoKey);
    if (!key) throw Error(`there is no record for the given DID: ${did}`);

    const peer = await Storage.DbPeer.new(`Peer_${did}`);
    const chatternet = new ChatterNet({ device, peer });

    return chatternet;
  }

  stop() {
    this.dbs.peer.db.close();
    this.dbs.device.db.close();
  }

  async getNameSuffix(did: string, maxLength: number = 8): Promise<Storage.NameSuffix> {
    let nameSuffix = await this.dbs.peer.nameSuffix.get(did);
    if (nameSuffix) return nameSuffix;
    return {
      name: "",
      suffix: did.split("").reverse().slice(0, maxLength).join(""),
    };
  }
}
