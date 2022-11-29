# Chatter Net Client

Chatter Net is a modern decentralized semantic web built atop self-sovereign identity.

For more, you can have a look at the sibling [server project](https://github.com/chatternet/chatternet-server-http),
and a prototype work-in-progress [social application](https://www.conversely.social) used to dog food the development process.

**Warning**: Chatter Net is currently in the prototype phase.
Features are missing,
features are broken,
and the public interface will change.

## Project Objectives

Chatter Net is a platform which is:

- **Open**: anyone can participate in, extend, and innovate on the platform.
- **Decentralized**: there is no central point of failure. Network consensus determines what content arrives to a user.
- **Self-moderating**: a user has enough control over what they receive to reject spam content.

Chatter Net aims to solve the problem of central ownership of user identity.
There are currently few organizations which control the vast majority of the identities of online users.
When the objectives of these organizations and those of the users become misaligned,
this can cause major problems for the users.

After investing 100s or 1000s of hours into building a network and content on a platform,
a user might be banned from the platform with no appeal process,
a user's content might be subject to summarily deleted or otherwise made inaccessible with no explanation,
a user might be asked to pay fees to continue accessing the content and network they built themselves,
etc.

The proposed solution is simple:
allow a user to prove their identity to other users without relying on a 3rd party;
and allow users verify the origin of some content without relying on a 3rd party.

## Examples

Following is an example demonstrating how to:
instantiate a client node,
connect to some servers,
and post a message to the network.
In the examples, string enclosed in `<>` brackets are dummy values.

```typescript
import { ChatterNet } from "chatternet-client-http";
const did = "did:key:<user>";
const password = "<password>";
const chatterNet = new ChatterNet(
    did,
    password,
    [
        {
            did: "did:key:<server1>",
            url: "https://<server1-url>",
        },
        {
            did: "did:key:<key>",
            url: "https://<server2-url>",
        },
    ],
);
const { message, objects } = await chatterNet.newNote("Hi!");
chatterNet.postMessageObjectDoc(note);
```

The `ChatterNet.newNote` method builds an [Activity Stream](https://www.w3.org/ns/activitystreams) object of type `Create` whose object is a `Note`.
The message is then signed with the client actor's key.

The `message` variable is a [JSON-LD](https://json-ld.org/) objects similar to the following:

```json
{
    {
        "@context": [
            "https://www.w3.org/ns/activitystreams",
            "https://www.w3.org/2018/credentials/v1",
            "https://w3id.org/security/suites/ed25519-2020/v1"
        ],
        "id": "urn:cid:<message>",
        "type": "Create",
        "actor": "did:key:<user>/actor",
        "object": ["urn:cid:<note>"],
        "published": "2000-01-01T00:00:00.000Z",
        "proof": {
            "type": "Ed25519Signature2020",
            "proofPurpose": "assertionMethod",
            "proofValue": "<proof>",
            "verificationMethod": "did:key:<user>#<user>",
            "created": "2000-00-00T00:00:00Z"
        },
        "audience": ["did:key:<user>/actor/followers"]
    }
}
```

And the `objects` variable is a list such as:

```json
[
    {
        "@context": ["https://www.w3.org/ns/activitystreams"],
        "id": "urn:cid:<note>",
        "type": "Note",
        "content": "Hi!",
    }
]
```

As you can see, the message is an activity (in this case of type `Create`),
whose actor is the local client's user.
And the object of the activity is just the ID of the note object.
In this way, Chatter Net messages describe content, but do not contain that content.

You can also create your own messages and objects and publish them to the network:

```typescript
import { Messages } from "chatternet-client-http";
const did = "did:key:<user>";
const content = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><body>Hi!</body>";
const mediaType = "application/xml";
const document = await Messages.newObjectDoc("Document", { content, mediaType });
const message = await chatterNet.newMessage([document.id], "Create");
chatterNet.postMessageObjectDoc({ message, objects: [document] });
```

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

## Roadmap

There is a lot of work still needed to make this project workable. Here are some short term objectives:

- Message deletion and unfollow.
- Local message store.
- Server selection and load balancing.
- Account migration / recovery.

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
