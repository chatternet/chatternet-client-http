declare module "@digitalbazaar/ed25519-verification-key-2020" {
  /*!
   * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
   */
  export class Ed25519VerificationKey2020 extends LDKeyPair {
    suite: string;

    /**
     * An implementation of the Ed25519VerificationKey2020 spec, for use with
     * Linked Data Proofs.
     *
     * @see https://w3c-ccg.github.io/lds-ed25519-2020/#ed25519verificationkey2020
     * @see https://github.com/digitalbazaar/jsonld-signatures
     *
     * @param {object} options - Options hashmap.
     * @param {string} options.controller - Controller DID or document url.
     * @param {string} [options.id] - The key ID. If not provided, will be
     *   composed of controller and key fingerprint as hash fragment.
     * @param {string} options.publicKeyMultibase - Multibase encoded public key
     *   with a multicodec ed25519-pub varint header [0xed, 0x01].
     * @param {string} [options.privateKeyMultibase] - Multibase private key
     *   with a multicodec ed25519-priv varint header [0x80, 0x26].
     * @param {string} [options.revoked] - Timestamp of when the key has been
     *   revoked, in RFC3339 format. If not present, the key itself is considered
     *   not revoked. Note that this mechanism is slightly different than DID
     *   Document key revocation, where a DID controller can revoke a key from
     *   that DID by removing it from the DID Document.
     */
    constructor(options = {});

    /**
     * Creates an Ed25519 Key Pair from an existing serialized key pair.
     *
     * @param {object} options - Key pair options (see constructor).
     * @example
     * > const keyPair = await Ed25519VerificationKey2020.from({
     * controller: 'did:ex:1234',
     * type: 'Ed25519VerificationKey2020',
     * publicKeyMultibase,
     * privateKeyMultibase
     * });
     *
     * @returns {Promise<Ed25519VerificationKey2020>} An Ed25519 Key Pair.
     */
    static async from(options);

    /**
     * Instance creation method for backwards compatibility with the
     * `Ed25519VerificationKey2018` key suite.
     *
     * @see https://github.com/digitalbazaar/ed25519-verification-key-2018
     * @typedef {object} Ed25519VerificationKey2018
     * @param {Ed25519VerificationKey2018} keyPair - Ed25519 2018 suite key pair.
     *
     * @returns {Ed25519VerificationKey2020} - 2020 suite instance.
     */
    static fromEd25519VerificationKey2018({ keyPair } = {});

    /**
     * Creates a key pair instance (public key only) from a JsonWebKey2020
     * object.
     *
     * @see https://w3c-ccg.github.io/lds-jws2020/#json-web-key-2020
     *
     * @param {object} options - Options hashmap.
     * @param {string} options.id - Key id.
     * @param {string} options.type - Key suite type.
     * @param {string} options.controller - Key controller.
     * @param {object} options.publicKeyJwk - JWK object.
     *
     * @returns {Promise<Ed25519VerificationKey2020>} Resolves with key pair.
     */
    static fromJsonWebKey2020({ id, type, controller, publicKeyJwk } = {});

    /**
     * Generates a KeyPair with an optional deterministic seed.
     *
     * @param {object} [options={}] - Options hashmap.
     * @param {Uint8Array} [options.seed] - A 32-byte array seed for a
     *   deterministic key.
     *
     * @returns {Promise<Ed25519VerificationKey2020>} Resolves with generated
     *   public/private key pair.
     */
    static async generate({ seed, ...keyPairOptions } = {});

    /**
     * Creates an instance of Ed25519VerificationKey2020 from a key fingerprint.
     *
     * @param {object} options - Options hashmap.
     * @param {string} options.fingerprint - Multibase encoded key fingerprint.
     *
     * @returns {Ed25519VerificationKey2020} Returns key pair instance (with
     *   public key only).
     */
    static fromFingerprint({ fingerprint } = {});

    /**
     * Generates and returns a multiformats encoded
     * ed25519 public key fingerprint (for use with cryptonyms, for example).
     *
     * @see https://github.com/multiformats/multicodec
     *
     * @returns {string} The fingerprint.
     */
    fingerprint();

    /**
     * Exports the serialized representation of the KeyPair
     * and other information that JSON-LD Signatures can use to form a proof.
     *
     * @param {object} [options={}] - Options hashmap.
     * @param {boolean} [options.publicKey] - Export public key material?
     * @param {boolean} [options.privateKey] - Export private key material?
     * @param {boolean} [options.includeContext] - Include JSON-LD context?
     *
     * @returns {object} A plain js object that's ready for serialization
     *   (to JSON, etc), for use in DIDs, Linked Data Proofs, etc.
     */
    export({ publicKey = false, privateKey = false, includeContext = false } = {});

    /**
     * Returns the JWK representation of this key pair.
     *
     * @see https://datatracker.ietf.org/doc/html/rfc8037
     *
     * @param {object} [options={}] - Options hashmap.
     * @param {boolean} [options.publicKey] - Include public key?
     * @param {boolean} [options.privateKey] - Include private key?
     *
     * @returns {{kty: string, crv: string, x: string, d: string}} JWK
     *   representation.
     */
    toJwk({ publicKey = true, privateKey = false } = {});

    /**
     * @see https://datatracker.ietf.org/doc/html/rfc8037#appendix-A.3
     *
     * @returns {Promise<string>} JWK Thumbprint.
     */
    async jwkThumbprint();

    /**
     * Returns the JsonWebKey2020 representation of this key pair.
     *
     * @see https://w3c-ccg.github.io/lds-jws2020/#json-web-key-2020
     *
     * @returns {Promise<object>} JsonWebKey2020 representation.
     */
    async toJsonWebKey2020();

    /**
     * Tests whether the fingerprint was generated from a given key pair.
     *
     * @example
     * > edKeyPair.verifyFingerprint({fingerprint: 'z6Mk2S2Q...6MkaFJewa'});
     * {valid: true};
     *
     * @param {object} options - Options hashmap.
     * @param {string} options.fingerprint - A public key fingerprint.
     *
     * @returns {{valid: boolean, error: *}} Result of verification.
     */
    verifyFingerprint({ fingerprint } = {});

    signer();

    verifier();
  }
}
