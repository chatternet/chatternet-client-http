# Chatter Net Client

Chatter Net is a modern decentralized semantic web built atop self-sovereign identity.

Find more information [chatternet.github.io](https://chatternet.github.io/).

**Warning**: Chatter Net is currently in the prototype phase.
Features are missing,
features are broken,
and the public interface will change.

## Project Objectives

Chatter Net is a platform which is:

- **Open**: anyone can participate in, extend, and innovate on the platform.
- **Decentralized**: there is no central point of failure. Network consensus determines what content arrives to a user.
- **Self-moderating**: a user has enough control over what they receive to reject spam content.

## Technology

Whereas the world wide web is a web of HTML documents,
Chatter Net is a web of self-signed semantic documents.
It closely follows (but is not fully compliant with) the [Activity Pub](https://www.w3.org/TR/activitypub/) protocol.
Consequently, it is closely related to other [federated platforms](https://fediverse.party/),
of which [Mastodon](https://joinmastodon.org/) is the a well established platform.

Chatter Net's self-signed data model does differ in a subtle yet meaningful way:
**the authority resides in the users of the network, not the servers**.

This is what allows the project to realize its objectives.

- No de-platforming: since no server is needed to verify the identity of a user, no server can prevent a user from accessing the network.
- No platform lock-in: since no server is needed to verify the authenticity of data, no server can lock data away from users and other servers.
- No spam from arbitrary users: would-be spammers need not only convince a server to trust them, they must directly convince other users.

### Data model

[Activity Streams](https://www.w3.org/ns/activitystreams) is semantic, self-describing JSON data format.
It can be used to describe arbitrary data as well as interactions between actors and the data.

### Identity

The [DID Key](https://github.com/digitalbazaar/did-method-key/) standard uses public-private key pair cryptography to prove identity.
An account is created locally by a user,
and the private key created by that user allows them to prove their identity.
[Verifiable Credential Proofs](https://w3c.github.io/vc-data-integrity/) allow the users to verify the authenticity of messages.

### Networking

Chatter Net does not rely on a specific network stack or protocol.
It is instead specified by its _data model_.
It would be possible (though prohibitively slow) to operate a Chatter Net network using carrier pigeons.

This library includes client functionality to communicate with a network of [HTTP servers](https://github.com/chatternet/chatternet-server-http/).
Other network implementations could be added in the future.

## Examples

Coming soon.

## Development

### Requirements

The only system requirement is Node JS and a web browser.
You can get Node JS on macOS or Linux with the following command:

```bash
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install node
```

### Installation

Get the source code using Git:

```bash
git clone https://github.com/chatternet/chatternet-lib-js.git
```

Or by downloading and extracting from
<https://github.com/chatternet/chatternet-lib-js/archive/refs/heads/main.zip>.

Then install using NPM:

```bash
npm install
```

### Commands

- `npm run clean`: remove the build artifacts
- `npm run fmt`: format all source code
- `npm run build`: build the package
- `npm run test`: run all tests (in a node environment)

### Package configuration

Package building is handled by `aegir`:
<https://ipfs.github.io/aegir/>.
This is a Typescript template which necessitates further configuration:
<https://github.com/ipfs/aegir/blob/master/md/ts-jsdoc.md>.

#### package.json

- The `types` key is set to `module` such that the project is exported as an ESM.
- TS types are output at `dist/src/index.d.ts`.
- The `files` key avoids packaging the compiled tests.
- The `exports` key specifies which module exports can be imported from the package.

### Testing

NOTE: you will need a node version >= 19.0.0 to run the test suite.

Test are added to the `test` directory with the suffix `.spec.ts`.
They can import from `src` using Typescript imports and ESM imports.

The tests are themselves built and output in `dist/test`.
From there, they import from the built `dist/src`.
In this way the tests run as compiled JS,
calling code from the distributed module.

To run integration tests against a server,
set the environment variable `CHATTERNET_TEST_SERVER`.

For example, to verify if a new node builds and connects:

```bash
CHATTERNET_TEST_SERVER='http://127.0.0.1:3030' npm run test -- -- -f 'chatter net builds new'
```

## TODO

- pin messages to local
  - when message is added
  - for messages created by the user
- transfer key to another device
- move an account
- interact with top servers
  - verify health periodically
