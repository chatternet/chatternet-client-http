declare module "@digitalbazaar/did-method-key" {
  /*!
   * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
   */
  export class DidKeyDriver {
    /**
     * @param {object} options - Options hashmap.
     * @param {object} [options.verificationSuite=Ed25519VerificationKey2020] -
     *   Key suite for the signature verification key suite to use.
     */
    constructor({ verificationSuite = Ed25519VerificationKey2020 } = {});

    /**
     * Generates a new `did:key` method DID Document (optionally, from a
     * deterministic seed value).
     *
     * @param {object} options - Options hashmap.
     * @param {Uint8Array} [options.seed] - A 32-byte array seed for a
     *   deterministic key.
     *
     * @returns {Promise<{didDocument: object, keyPairs: Map,
     *   methodFor: Function}>} Resolves with the generated DID Document, along
     *   with the corresponding key pairs used to generate it (for storage in a
     *   KMS).
     */
    async generate({ seed } = {});

    /**
     * Returns the public key (verification method) object for a given DID
     * Document and purpose. Useful in conjunction with a `.get()` call.
     *
     * @example
     * const didDocument = await didKeyDriver.get({did});
     * const authKeyData = didDriver.publicMethodFor({
     *   didDocument, purpose: 'authentication'
     * });
     * // You can then create a suite instance object to verify signatures etc.
     * const authPublicKey = await cryptoLd.from(authKeyData);
     * const {verify} = authPublicKey.verifier();
     *
     * @param {object} options - Options hashmap.
     * @param {object} options.didDocument - DID Document (retrieved via a
     *   `.get()` or from some other source).
     * @param {string} options.purpose - Verification method purpose, such as
     *   'authentication', 'assertionMethod', 'keyAgreement' and so on.
     *
     * @returns {object} Returns the public key object (obtained from the DID
     *   Document), without a `@context`.
     */
    publicMethodFor({ didDocument, purpose } = {});

    /**
     * Returns a `did:key` method DID Document for a given DID, or a key document
     * for a given DID URL (key id).
     * Either a `did` or `url` param is required.
     *
     * @example
     * await resolver.get({did}); // -> did document
     * await resolver.get({url: keyId}); // -> public key node
     *
     * @param {object} options - Options hashmap.
     * @param {string} [options.did] - DID URL or a key id (either an ed25519 key
     *   or an x25519 key-agreement key id).
     * @param {string} [options.url] - Alias for the `did` url param, supported
     *   for better readability of invoking code.
     *
     * @returns {Promise<object>} Resolves to a DID Document or a
     *   public key node with context.
     */
    async get({ did, url } = {});

    /**
     * Converts a public key object to a `did:key` method DID Document.
     * Note that unlike `generate()`, a `keyPairs` map is not returned. Use
     * `publicMethodFor()` to fetch keys for particular proof purposes.
     *
     * @param {object} options - Options hashmap.
     * @typedef LDKeyPair
     * @param {LDKeyPair|object} options.publicKeyDescription - Public key object
     *   used to generate the DID document (either an LDKeyPair instance
     *   containing public key material, or a "key description" plain object
     *   (such as that generated from a KMS)).
     *
     * @returns {Promise<object>} Resolves with the generated DID Document.
     */
    async publicKeyToDidDoc({ publicKeyDescription } = {});

    /**
     * Computes and returns the id of a given key pair. Used by `did-io` drivers.
     *
     * @param {object} options - Options hashmap.
     * @param {LDKeyPair} options.keyPair - The key pair used when computing the
     *   identifier.
     *
     * @returns {string} Returns the key's id.
     */
    async computeId({ keyPair }) {
      return `did:key:${keyPair.fingerprint()}#${keyPair.fingerprint()}`;
    }
  }
}
