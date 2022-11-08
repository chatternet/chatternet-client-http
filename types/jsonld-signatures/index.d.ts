/*!
 * Copyright (c) 2010-2022 Digital Bazaar, Inc. All rights reserved.
 */

const jsigs = {
  /**
   * Cryptographically signs the provided document by adding a `proof` section,
   * based on the provided suite and proof purpose.
   *
   * @param {object} document - The JSON-LD document to be signed.
   *
   * @param {object} options - Options hashmap.
   * @param {LinkedDataSignature} options.suite - The linked data signature
   *   cryptographic suite, containing private key material, with which to sign
   *   the document.
   *
   * @param {ProofPurpose} purpose - A proof purpose instance that will
   *   match proofs to be verified and ensure they were created according to
   *   the appropriate purpose.
   *
   * @param {function} documentLoader  - A secure document loader (it is
   *   recommended to use one that provides static known documents, instead of
   *   fetching from the web) for returning contexts, controller documents, keys,
   *   and other relevant URLs needed for the proof.
   *
   * Advanced optional parameters and overrides:
   *
   * @param {function} [options.expansionMap] - NOT SUPPORTED; do not use.
   * @param {boolean} [options.addSuiteContext=true] - Toggles the default
   *   behavior of each signature suite enforcing the presence of its own
   *   `@context` (if it is not present, it's added to the context list).
   *
   * @returns {Promise<object>} Resolves with signed document.
   */
  sign: async(
    document,
    ({ suite, purpose, documentLoader, expansionMap, addSuiteContext = true } = {})
  ),

  /**
   * Verifies the linked data signature on the provided document.
   *
   * @param {object} document - The JSON-LD document with one or more proofs to be
   *   verified.
   *
   * @param {object} options - The options to use.
   * @param {LinkedDataSignature|LinkedDataSignature[]} options.suite -
   *   Acceptable signature suite instances for verifying the proof(s).
   *
   * @param {ProofPurpose} purpose - A proof purpose instance that will
   *   match proofs to be verified and ensure they were created according to
   *   the appropriate purpose.
   *
   * Advanced optional parameters and overrides:
   *
   * @param {function} [options.documentLoader]  - A custom document loader,
   *   `Promise<RemoteDocument> documentLoader(url)`.
   * @param {function} [options.expansionMap] - NOT SUPPORTED; do not use.
   *
   * @return {Promise<{verified: boolean, results: Array,
   *   error: VerificationError}>}
   *   resolves with an object with a `verified` boolean property that is `true`
   *   if at least one proof matching the given purpose and suite verifies and
   *   `false` otherwise; a `results` property with an array of detailed results;
   *   if `false` an `error` property will be present, with `error.errors`
   *   containing all of the errors that occurred during the verification process.
   */
  verify: async(document, ({ suite, purpose, documentLoader, expansionMap } = {})),

  // expose ProofPurpose classes to enable extensions
  purposes: { AssertionProofPurpose },
};

export default jsigs;
