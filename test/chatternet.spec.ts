import { ChatterNet, DidKey, MessageIter } from "../src/index.js";
import { didFromActorId } from "../src/model/actor.js";
import type { Actor, Message } from "../src/model/index.js";
import type { ServerInfo } from "../src/storage.js";
import * as Storage from "../src/storage.js";
import * as assert from "assert";
import "fake-indexeddb/auto";
import { get } from "lodash-es";
import "mock-local-storage";

// @ts-ignore
global.window = {
  crypto: globalThis.crypto,
  localStorage: global.localStorage,
};

function actorToServerInfo(actor: Actor): ServerInfo {
  const did = didFromActorId(actor.id);
  const actorUrl = actor.url;
  if (did == null) throw Error("actor ID is invalid");
  if (actorUrl == null) throw Error("actor has no URL");
  if (!actorUrl.endsWith(`/${actor.id}`)) throw Error("actor URL is not a path to its ID");
  const url = actorUrl.slice(0, -actor.id.length - 1);
  return { url, did };
}

async function clearDbs() {
  await (await Storage.DbDevice.new()).clear();
  await (await Storage.DbPeer.new()).clear();
}

describe("chatter net", () => {
  const defaultServersActor: Actor[] = process.env.CHATTERNET_TEST_SERVER
    ? [JSON.parse(process.env.CHATTERNET_TEST_SERVER)]
    : [];
  const defaultServers: ServerInfo[] = defaultServersActor.map(actorToServerInfo);

  it("builds from new account", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    await ChatterNet.new(did, "abc", defaultServers);
  });

  it("lists accounts and names", async () => {
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "some name 2", "abc");
    const did3 = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const accounts = await ChatterNet.getAccountNames();
    const didToName = new Map(accounts.map(({ id, name }) => [id, name]));
    assert.equal(didToName.size, 3);
    assert.equal(didToName.get(did1), "some name");
    assert.equal(didToName.get(did2), "some name 2");
    assert.equal(didToName.get(did3), "some name");
  });

  it("doesnt build for wrong password", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    assert.rejects(() => ChatterNet.new(did, "abcd", []));
  });

  it("changes name and builds with new name", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      chatterNet.changeName("some other name");
      assert.equal(chatterNet.getLocalName(), "some other name");
    }
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      assert.equal(chatterNet.getLocalName(), "some other name");
    }
  });

  it("changes password and builds with new password", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      await chatterNet.changePassword("abc", "abcd");
    }
    {
      await ChatterNet.new(did, "abcd", defaultServers);
    }
  });

  it("doesnt change password with wrong password", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    assert.rejects(() => chatterNet.changePassword("abcd", "abcd"));
  });

  it("builds a message", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const followers = ChatterNet.followersFromId(ChatterNet.actorFromDid(did));
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const message = await chatterNet.newMessage(["id:a", "id:b"], "View", [followers]);
    assert.deepEqual(message.object, ["id:a", "id:b"]);
    assert.equal(message.type, "View");
  });

  it("builds a note", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const { documents } = await chatterNet.newNote("abcd", await chatterNet.toSelf());
    assert.equal(documents.length, 2);
    assert.equal(get(documents, "0.type"), "Note");
    assert.equal(get(documents, "0.content"), "abcd");
    assert.equal(get(documents, "1.type"), "Person");
    assert.equal(get(documents, "1.name"), "some name");
  });

  it("builds a delete message", async () => {
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const messageObjectDoc = await chatterNet1.newNote("abcd", await chatterNet1.toSelf());
    // if local has message, it can be deleted
    await chatterNet1.storeMessageDocuments(messageObjectDoc);
    const deleteMessage = await chatterNet1.newDelete(messageObjectDoc.message.id);
    assert.ok(deleteMessage);
    assert.equal(deleteMessage.type, "Delete");
    assert.deepEqual(deleteMessage.object, [messageObjectDoc.message.id]);
  });

  it("follows unfollows and lists follows", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      const { message } = await chatterNet.newFollow({ id: "id:a", name: "name a", timestamp: 10 });
      assert.equal(message.type, "Add");
      assert.deepEqual(message.object, ["id:a"]);
      assert.deepEqual(message.target, [`${did}/actor/following`]);
    }
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      await chatterNet.newFollow({ id: "id:b", name: "name b", timestamp: 10 });
    }
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      const { message } = await chatterNet.newUnfollow("id:a");
      assert.equal(message.type, "Remove");
      assert.deepEqual(message.object, ["id:a"]);
      assert.deepEqual(message.target, [`${did}/actor/following`]);
    }
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      const { message } = await chatterNet.buildSetFollows();
      assert.deepEqual(new Set(message.object), new Set([`${did}/actor`, "id:b"]));
    }
  });

  it("builds a listen server", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const { message } = await chatterNet.newListen("did:example:a");
    assert.equal(message.type, "Listen");
    assert.deepEqual(message.object, ["did:example:a/actor"]);
  });

  it("builds a view message", async () => {
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const followers1 = ChatterNet.followersFromId(ChatterNet.actorFromDid(did1));
    const origin = await chatterNet1.newMessage(["id:a"], "Create", [followers1]);
    const message = await chatterNet2.getOrNewViewMessage(origin);
    assert.ok(message);
    assert.equal(message.type, "View");
    assert.deepEqual(message.origin, [origin.id]);
    assert.deepEqual(message.object, ["id:a"]);
  });

  it("doest build a view of a view", async () => {
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const followers1 = ChatterNet.followersFromId(ChatterNet.actorFromDid(did1));
    const origin = await chatterNet1.newMessage(["id:a"], "View", [followers1]);
    const message = await chatterNet2.getOrNewViewMessage(origin);
    assert.ok(!message);
  });

  it("doest build a view of a message by self", async () => {
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const followers1 = ChatterNet.followersFromId(ChatterNet.actorFromDid(did1));
    const origin = await chatterNet1.newMessage(["id:a"], "Create", [followers1]);
    const message = await chatterNet1.getOrNewViewMessage(origin);
    assert.ok(!message);
  });

  it("re-uses a view message", async () => {
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const followers1 = ChatterNet.followersFromId(ChatterNet.actorFromDid(did1));
    const origin = await chatterNet1.newMessage(["id:a"], "Create", [followers1]);
    const message1 = await chatterNet2.getOrNewViewMessage(origin);
    const message2 = await chatterNet2.getOrNewViewMessage(origin);
    assert.ok(message1);
    assert.ok(message2);
    assert.deepEqual(message1, message2);
  });

  it("builds actor", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const { message, documents } = await chatterNet.buildActor();
    assert.equal(message.type, "Create");
    assert.equal(message.object, ChatterNet.actorFromDid(did));
    assert.equal(documents.length, 1);
    assert.equal(documents[0].id, ChatterNet.actorFromDid(did));
  });

  it("posts and gets actor with server", async () => {
    if (defaultServers.length <= 0) return;
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    await chatterNet.postMessageDocuments(await chatterNet.buildActor());
    const actor = await chatterNet.getActor(ChatterNet.actorFromDid(did));
    assert.ok(actor);
    assert.equal(actor.id, ChatterNet.actorFromDid(did));
  });

  it("posts and gets actor with local", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", []);
    await chatterNet.storeMessageDocuments(await chatterNet.buildActor());
    const actor = await chatterNet.getActor(ChatterNet.actorFromDid(did));
    assert.ok(actor);
    assert.equal(actor.id, ChatterNet.actorFromDid(did));
  });

  async function listMessages(messageIter: MessageIter): Promise<Message[]> {
    const messages: Message[] = [];
    for await (const message of messageIter.messages()) if (!!message) messages.push(message);
    return messages;
  }

  it("posts and gets messages with server", async () => {
    if (defaultServers.length <= 0) return;

    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const did3 = await ChatterNet.newAccount(await DidKey.newKey(), "name3", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const chatterNet3 = await ChatterNet.new(did3, "abc", defaultServers);

    // did1 posts
    const note = await chatterNet1.newNote("Hi!", await chatterNet1.toSelf());
    await chatterNet1.postMessageDocuments(note);
    // can't get from local
    assert.ok(!(await chatterNet1.getDocument(note.message.id, true)));
    // gets object
    assert.equal((await chatterNet1.getDocument(note.message.id))?.id, note.message.id);
    assert.equal((await chatterNet1.getDocument(note.documents[0].id))?.id, note.documents[0].id);
    // iterates own message
    const messages1 = await listMessages(await chatterNet1.buildMessageIter());
    assert.ok(new Set(messages1.map((x) => x.id)).has(note.message.id));

    // did2 follows did1
    await chatterNet2.postMessageDocuments(
      await chatterNet2.newFollow({
        id: ChatterNet.actorFromDid(did1),
        name: "name",
        timestamp: 10,
      })
    );
    // iterates message
    const messages2 = await listMessages(await chatterNet2.buildMessageIter());
    assert.ok(new Set(messages2.map((x) => x.id)).has(note.message.id));
    // views message
    const viewMessage = await chatterNet2.getOrNewViewMessage(note.message);
    assert.ok(viewMessage);
    await chatterNet2.postMessageDocuments({ message: viewMessage, documents: [] });

    // did3 follows did2
    await chatterNet3.postMessageDocuments(
      await chatterNet3.newFollow({
        id: ChatterNet.actorFromDid(did2),
        name: "name",
        timestamp: 10,
      })
    );
    // did3 see view
    const messages3 = await listMessages(await chatterNet2.buildMessageIter());
    assert.ok(new Set(messages3.map((x) => x.id)).has(viewMessage.id));
  });

  it("deletes messages and documents with server", async () => {
    if (defaultServers.length <= 0) return;

    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);

    // did1 posts
    const note = await chatterNet1.newNote("Hi!", await chatterNet1.toSelf());
    await chatterNet1.postMessageDocuments(note);
    // gets object
    assert.equal((await chatterNet1.getDocument(note.message.id))?.id, note.message.id);
    assert.equal((await chatterNet1.getDocument(note.documents[0].id))?.id, note.documents[0].id);

    const deleteDocument = await chatterNet1.newDelete(note.documents[0].id);
    const deleteMessage = await chatterNet1.newDelete(note.message.id);
    await chatterNet1.postMessageDocuments({ message: deleteDocument, documents: [] });
    await chatterNet1.postMessageDocuments({ message: deleteMessage, documents: [] });
  });

  it("gets messages from actor with server", async () => {
    if (defaultServers.length <= 0) return;
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    // did1 posts
    const note = await chatterNet1.newNote("Hi!", await chatterNet1.toSelf());
    await chatterNet1.postMessageDocuments(note);
    // iterates message
    const messages = await listMessages(await chatterNet2.buildMessageIterFrom(`${did1}/actor`));
    assert.ok(new Set(messages.map((x) => x.id)).has(note.message.id));
  });

  it("gets create message for object with server", async () => {
    if (defaultServers.length <= 0) return;
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    // did1 posts
    const note = await chatterNet.newNote("Hi!", await chatterNet.toSelf());
    await chatterNet.postMessageDocuments(note);
    const message = await chatterNet.getCreateMessageForDocument(
      note.documents[0].id,
      `${did}/actor`
    );
    assert.equal(message?.id, note.message.id);
  });

  it("doesnt post invalid message with server", async () => {
    if (defaultServers.length <= 0) return;
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const note = await chatterNet1.newNote("hello", await chatterNet1.toSelf());
    // sent from wrong account
    assert.rejects(async () => await chatterNet2.postMessageDocuments(note));
  });

  it("doesnt post invalid document with server", async () => {
    if (defaultServers.length <= 0) return;
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const note = await chatterNet.newNote("hello", await chatterNet.toSelf());
    // invalid document id
    note.documents[0].id = "urn:cid:a";
    assert.rejects(async () => await chatterNet.postMessageDocuments(note));
  });

  it("posts and gets messages with local", async () => {
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", []);
    // did1 posts
    const note = await chatterNet1.newNote("Hi!", await chatterNet1.toSelf());
    await chatterNet1.storeMessageDocuments(note);
    // gets object
    assert.equal((await chatterNet1.getDocument(note.message.id))?.id, note.message.id);
    assert.equal((await chatterNet1.getDocument(note.documents[0].id))?.id, note.documents[0].id);
    // iterates own message
    const messages1 = await listMessages(await chatterNet1.buildMessageIter());
    assert.ok(new Set(messages1.map((x) => x.id)).has(note.message.id));
  });

  it("unstores local message", async () => {
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", []);
    // did1 posts
    const note = await chatterNet1.newNote("Hi!", await chatterNet1.toSelf());
    await chatterNet1.storeMessageDocuments(note);
    // can retrieve message
    assert.equal((await chatterNet1.getDocument(note.message.id))?.id, note.message.id);
    assert.equal((await chatterNet1.getDocument(note.documents[0].id))?.id, note.documents[0].id);
    assert.equal((await listMessages(await chatterNet1.buildMessageIter())).length, 1);
    // message is not deleted
    assert.ok(!(await chatterNet1.isDeleted(note.message.id)));
    // removes message
    await chatterNet1.deleteLocalId(note.message.id);
    // message is deleted
    assert.ok(await chatterNet1.isDeleted(note.message.id));
    // can no longer retrieve message object
    assert.ok(!(await chatterNet1.getDocument(note.message.id)));
    assert.ok(!(await chatterNet1.getDocument(note.documents[0].id)));
    // no longer iterates message
    assert.equal((await listMessages(await chatterNet1.buildMessageIter())).length, 0);
  });

  it("builds message affinity", async () => {
    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const did3 = await ChatterNet.newAccount(await DidKey.newKey(), "name3", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const chatterNet3 = await ChatterNet.new(did3, "abc", defaultServers);

    // did1 posts
    const { message: blankMessage } = await chatterNet1.newNote("Hi!", []);
    const { message: noteMessage } = await chatterNet1.newNote("Hi!", await chatterNet1.toSelf());
    assert.deepEqual(await chatterNet1.buildMessageAffinity(blankMessage), {
      fromContact: true,
      inAudience: false,
    });
    assert.deepEqual(await chatterNet1.buildMessageAffinity(noteMessage), {
      fromContact: true,
      inAudience: true,
    });

    // did2 follows did1
    await chatterNet2.newFollow({ id: ChatterNet.actorFromDid(did1), name: "name", timestamp: 10 });
    assert.deepEqual(await chatterNet2.buildMessageAffinity(noteMessage), {
      fromContact: true,
      inAudience: true,
    });

    // did3 follows did2
    await chatterNet3.newFollow({ id: ChatterNet.actorFromDid(did2), name: "name", timestamp: 10 });
    assert.deepEqual(await chatterNet3.buildMessageAffinity(noteMessage), {
      fromContact: false,
      inAudience: false,
    });
  });

  it("iterates followers with server", async () => {
    if (defaultServers.length <= 0) return;

    await clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const did3 = await ChatterNet.newAccount(await DidKey.newKey(), "name3", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const chatterNet3 = await ChatterNet.new(did3, "abc", defaultServers);
    const actorId1 = ChatterNet.actorFromDid(did1);

    // did2 follows did1
    await chatterNet2.postMessageDocuments(
      await chatterNet2.newFollow({ id: actorId1, name: "name", timestamp: 10 })
    );
    // did3 follows did1
    await chatterNet3.postMessageDocuments(
      await chatterNet3.newFollow({ id: actorId1, name: "name", timestamp: 10 })
    );

    // iterates followers
    const iter = chatterNet1.buildFollowersIter();
    const followers: string[] = [];
    for await (const follower of iter.pageItems()) {
      followers.push(follower);
    }

    assert.deepEqual(
      new Set(followers),
      new Set([`${did3}/actor`, `${did2}/actor`, `${did1}/actor`])
    );
  });

  it("builds a tag", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const tag = await chatterNet.buildTag("abc");
    assert.equal(tag.name, "abc");
  });

  it("gets local did", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    assert.equal(chatterNet.getLocalDid(), did);
  });

  it("gets local name", async () => {
    await clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    assert.equal(chatterNet.getLocalName(), "some name");
  });

  it("builds actor form did", async () => {
    assert.equal(ChatterNet.actorFromDid("did:example:a"), "did:example:a/actor");
  });

  it("builds followers from id", async () => {
    assert.equal(ChatterNet.followersFromId("id:a"), "id:a/followers");
  });
});
