declare module "@digitalbazaar/vc" {
  /**
   * A JavaScript implementation of Verifiable Credentials.
   *
   * @author Dave Longley
   * @author David I. Lehn
   *
   * @license BSD 3-Clause License
   * Copyright (c) 2017-2022 Digital Bazaar, Inc.
   * All rights reserved.
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * Redistributions of source code must retain the above copyright notice,
   * this list of conditions and the following disclaimer.
   *
   * Redistributions in binary form must reproduce the above copyright
   * notice, this list of conditions and the following disclaimer in the
   * documentation and/or other materials provided with the distribution.
   *
   * Neither the name of the Digital Bazaar, Inc. nor the names of its
   * contributors may be used to endorse or promote products derived from
   * this software without specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
   * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
   * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
   * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
   * HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
   * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
   * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
   * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
   * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
   * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   */

  /**
   * Creates a proof purpose that will validate whether or not the verification
   * method in a proof was authorized by its declared controller for the
   * proof's purpose.
   */
  export class CredentialIssuancePurpose extends AssertionProofPurpose {
    /**
     * @param {object} options - The options to use.
     * @param {object} [options.controller] - The description of the controller,
     *   if it is not to be dereferenced via a `documentLoader`.
     * @param {string|Date|number} [options.date] - The expected date for
     *   the creation of the proof.
     * @param {number} [options.maxTimestampDelta=Infinity] - A maximum number
     *   of seconds that the date on the signature can deviate from.
     */
    constructor(options = {});

    /**
     * Validates the purpose of a proof. This method is called during
     * proof verification, after the proof value has been checked against the
     * given verification method (in the case of a digital signature, the
     * signature has been cryptographically verified against the public key).
     *
     * @param {object} proof - The proof to validate.
     * @param {object} options - The options to use.
     * @param {object} options.document - The document whose signature is
     *   being verified.
     * @param {object} options.suite - Signature suite used in
     *   the proof.
     * @param {string} options.verificationMethod - Key id URL to the paired
     *   public key.
     * @param {object} [options.documentLoader] - A document loader.
     * @param {object} [options.expansionMap] - An expansion map.
     *
     * @throws {Error} If verification method not authorized by controller.
     * @throws {Error} If proof's created timestamp is out of range.
     *
     * @returns {Promise<{valid: boolean, error: Error}>} Resolves on completion.
     */
    async validate(proof, { document, suite, verificationMethod, documentLoader, expansionMap });
  }

  // Z and T can be lowercase
  // RFC3339 regex
  export const dateRegex: RegExp;

  /**
   * @typedef {object} LinkedDataSignature
   */

  /**
   * @typedef {object} Presentation
   */

  /**
   * @typedef {object} ProofPurpose
   */

  /**
   * @typedef {object} VerifiableCredential
   */

  /**
   * @typedef {object} VerifiablePresentation
   */

  /**
   * @typedef {object} VerifyPresentationResult
   * @property {boolean} verified - True if verified, false if not.
   * @property {object} presentationResult
   * @property {Array} credentialResults
   * @property {object} error
   */

  /**
   * @typedef {object} VerifyCredentialResult
   * @property {boolean} verified - True if verified, false if not.
   * @property {object} statusResult
   * @property {Array} results
   * @property {object} error
   */

  /**
   * Issues a verifiable credential (by taking a base credential document,
   * and adding a digital signature to it).
   *
   * @param {object} [options={}] - The options to use.
   *
   * @param {object} options.credential - Base credential document.
   * @param {LinkedDataSignature} options.suite - Signature suite (with private
   *   key material), passed in to sign().
   *
   * @param {ProofPurpose} [options.purpose] - A ProofPurpose. If not specified,
   *   a default purpose will be created.
   *
   * Other optional params passed to `sign()`:
   * @param {object} [options.documentLoader] - A document loader.
   * @param {object} [options.expansionMap] - An expansion map.
   * @param {string|Date} [options.now] - A string representing date time in
   *   ISO 8601 format or an instance of Date. Defaults to current date time.
   *
   * @throws {Error} If missing required properties.
   *
   * @returns {Promise<VerifiableCredential>} Resolves on completion.
   */
  export async function issue(options = {});

  /**
   * Verifies a verifiable presentation:
   *   - Checks that the presentation is well-formed
   *   - Checks the proofs (for example, checks digital signatures against the
   *     provided public keys).
   *
   * @param {object} [options={}] - The options to use.
   *
   * @param {VerifiablePresentation} options.presentation - Verifiable
   *   presentation, signed or unsigned, that may contain within it a
   *   verifiable credential.
   *
   * @param {LinkedDataSignature|LinkedDataSignature[]} options.suite - One or
   *   more signature suites that are supported by the caller's use case. This is
   *   an explicit design decision -- the calling code must specify which
   *   signature types (ed25519, RSA, etc) are allowed.
   *   Although it is expected that the secure resolution/fetching of the public
   *   key material (to verify against) is to be handled by the documentLoader,
   *   the suite param can optionally include the key directly.
   *
   * @param {boolean} [options.unsignedPresentation=false] - By default, this
   *   function assumes that a presentation is signed (and will return an error if
   *   a `proof` section is missing). Set this to `true` if you're using an
   *   unsigned presentation.
   *
   * Either pass in a proof purpose,
   * @param {AuthenticationProofPurpose} [options.presentationPurpose] - Optional
   *   proof purpose (a default one will be created if not passed in).
   *
   * or a default purpose will be created with params:
   * @param {string} [options.challenge] - Required if purpose is not passed in.
   * @param {string} [options.controller] - A controller.
   * @param {string} [options.domain] - A domain.
   *
   * @param {Function} [options.documentLoader] - A document loader.
   * @param {Function} [options.checkStatus] - Optional function for checking
   *   credential status if `credentialStatus` is present on the credential.
   * @param {string|Date} [options.now] - A string representing date time in
   *   ISO 8601 format or an instance of Date. Defaults to current date time.
   *
   * @returns {Promise<VerifyPresentationResult>} The verification result.
   */
  export async function verify(options = {});

  /**
   * Verifies a verifiable credential:
   *   - Checks that the credential is well-formed
   *   - Checks the proofs (for example, checks digital signatures against the
   *     provided public keys).
   *
   * @param {object} [options={}] - The options.
   *
   * @param {object} options.credential - Verifiable credential.
   *
   * @param {LinkedDataSignature|LinkedDataSignature[]} options.suite - One or
   *   more signature suites that are supported by the caller's use case. This is
   *   an explicit design decision -- the calling code must specify which
   *   signature types (ed25519, RSA, etc) are allowed.
   *   Although it is expected that the secure resolution/fetching of the public
   *   key material (to verify against) is to be handled by the documentLoader,
   *   the suite param can optionally include the key directly.
   *
   * @param {CredentialIssuancePurpose} [options.purpose] - Optional
   *   proof purpose (a default one will be created if not passed in).
   * @param {Function} [options.documentLoader] - A document loader.
   * @param {Function} [options.checkStatus] - Optional function for checking
   *   credential status if `credentialStatus` is present on the credential.
   * @param {string|Date} [options.now] - A string representing date time in
   *   ISO 8601 format or an instance of Date. Defaults to current date time.
   *
   * @returns {Promise<VerifyCredentialResult>} The verification result.
   */
  export async function verifyCredential(options = {});

  /**
   * Creates an unsigned presentation from a given verifiable credential.
   *
   * @param {object} options - Options to use.
   * @param {object|Array<object>} [options.verifiableCredential] - One or more
   *   verifiable credential.
   * @param {string} [options.id] - Optional VP id.
   * @param {string} [options.holder] - Optional presentation holder url.
   * @param {string|Date} [options.now] - A string representing date time in
   *   ISO 8601 format or an instance of Date. Defaults to current date time.
   *
   * @throws {TypeError} If verifiableCredential param is missing.
   * @throws {Error} If the credential (or the presentation params) are missing
   *   required properties.
   *
   * @returns {Presentation} The credential wrapped inside of a
   *   VerifiablePresentation.
   */
  export function createPresentation(options = {});

  /**
   * Signs a given presentation.
   *
   * @param {object} [options={}] - Options to use.
   *
   * Required:
   * @param {Presentation} options.presentation - A presentation.
   * @param {LinkedDataSignature} options.suite - passed in to sign()
   *
   * Either pass in a ProofPurpose, or a default one will be created with params:
   * @param {ProofPurpose} [options.purpose] - A ProofPurpose. If not specified,
   *   a default purpose will be created with the domain and challenge options.
   *
   * @param {string} [options.domain] - A domain.
   * @param {string} options.challenge - A required challenge.
   *
   * @param {Function} [options.documentLoader] - A document loader.
   *
   * @returns {Promise<{VerifiablePresentation}>} A VerifiablePresentation with
   *   a proof.
   */
  export async function signPresentation(options = {});
}
