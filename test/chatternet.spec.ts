import { ChatterNet, DidKey, MessageIter } from "../src/index.js";
import type { MessageWithId } from "../src/messages.js";
import type { ServerInfo } from "../src/storage.js";
import * as assert from "assert";
import "fake-indexeddb/auto";
import "mock-local-storage";

// @ts-ignore
global.window = {
  crypto: globalThis.crypto,
  localStorage: global.localStorage,
};

describe("chatter net", () => {
  const defaultServers: ServerInfo[] = process.env.CHATTERNET_TEST_SERVER
    ? [JSON.parse(process.env.CHATTERNET_TEST_SERVER)]
    : [];

  it("builds from new account", async () => {
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    await ChatterNet.new(did, "abc", defaultServers);
  });

  it("lists accounts and names", async () => {
    await ChatterNet.clearDbs();
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
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    assert.rejects(() => ChatterNet.new(did, "abcd", []));
  });

  it("changes name and builds with new name", async () => {
    await ChatterNet.clearDbs();
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
    await ChatterNet.clearDbs();
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
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    assert.rejects(() => chatterNet.changePassword("abcd", "abcd"));
  });

  it("builds a message", async () => {
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const message = await chatterNet.newMessage(["id:a", "id:b"], "View");
    assert.deepEqual(message.object, ["id:a", "id:b"]);
    assert.equal(message.type, "View");
  });

  it("builds a note", async () => {
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const { objects } = await chatterNet.newNote("abcd");
    assert.equal(objects.length, 1);
    assert.equal(objects[0].type, "Note");
    assert.equal(objects[0].content, "abcd");
  });

  it("builds a delete message", async () => {
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const message = await chatterNet.newDelete("id:a");
    assert.equal(message.type, "Delete");
    assert.deepEqual(message.object, ["id:a"]);
  });

  it("adds follow and builds follows", async () => {
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      const { message } = await chatterNet.buildFollows();
      assert.deepEqual(new Set(message.object), new Set([`${did}/actor`]));
    }
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      const { message } = await chatterNet.newFollow("id:a");
      assert.equal(message.type, "Follow");
      assert.deepEqual(message.object, ["id:a"]);
    }
    {
      const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
      const { message } = await chatterNet.buildFollows();
      assert.deepEqual(new Set(message.object), new Set([`${did}/actor`, "id:a"]));
    }
  });

  it("builds a listen server", async () => {
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const message = await chatterNet.newListenServer("did:example:a", "https://a.example");
    assert.equal(message.type, "Listen");
    assert.deepEqual(message.object, ["did:example:a/actor"]);
    assert.deepEqual(message.instrument, { type: "Link", href: "https://a.example" });
  });

  it("builds a view message", async () => {
    await ChatterNet.clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const origin = await chatterNet1.newMessage(["id:a"], "Create");
    const message = await chatterNet2.getOrNewViewMessage(origin);
    assert.ok(message);
    assert.equal(message.type, "View");
    assert.deepEqual(message.origin, origin.id);
    assert.deepEqual(message.object, ["id:a"]);
  });

  it("doest build a view of a view", async () => {
    await ChatterNet.clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const origin = await chatterNet1.newMessage(["id:a"], "View");
    const message = await chatterNet2.getOrNewViewMessage(origin);
    assert.ok(!message);
  });

  it("doest build a view of a message by self", async () => {
    await ChatterNet.clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const origin = await chatterNet1.newMessage(["id:a"], "Create");
    const message = await chatterNet1.getOrNewViewMessage(origin);
    assert.ok(!message);
  });

  it("re-uses a view message", async () => {
    await ChatterNet.clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const origin = await chatterNet1.newMessage(["id:a"], "Create");
    const message1 = await chatterNet2.getOrNewViewMessage(origin);
    const message2 = await chatterNet2.getOrNewViewMessage(origin);
    assert.ok(message1);
    assert.ok(message2);
    assert.deepEqual(message1, message2);
  });

  it("builds actor", async () => {
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    const { message, objects } = await chatterNet.buildActor();
    assert.equal(message.type, "Create");
    assert.equal(message.object, ChatterNet.actorFromDid(did));
    assert.equal(objects.length, 1);
    assert.equal(objects[0].id, ChatterNet.actorFromDid(did));
  });

  it("posts and gets actor with server", async () => {
    if (defaultServers.length <= 0) return;
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    await chatterNet.postMessageObjectDoc(await chatterNet.buildActor());
    const actor = await chatterNet.getActor(ChatterNet.actorFromDid(did));
    assert.ok(actor);
    assert.equal(actor.id, ChatterNet.actorFromDid(did));
  });

  it("posts and gets actor with local", async () => {
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", []);
    await chatterNet.storeMessageObjectDoc(await chatterNet.buildActor());
    const actor = await chatterNet.getActor(ChatterNet.actorFromDid(did));
    assert.ok(actor);
    assert.equal(actor.id, ChatterNet.actorFromDid(did));
  });

  async function listMessages(messageIter: MessageIter): Promise<MessageWithId[]> {
    const messages: MessageWithId[] = [];
    for await (const message of messageIter.messages()) if (!!message) messages.push(message);
    return messages;
  }

  it("posts and gets messages with server", async () => {
    if (defaultServers.length <= 0) return;

    await ChatterNet.clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const did3 = await ChatterNet.newAccount(await DidKey.newKey(), "name3", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const chatterNet3 = await ChatterNet.new(did3, "abc", defaultServers);

    // did1 posts
    const note = await chatterNet1.newNote("Hi!");
    await chatterNet1.postMessageObjectDoc(note);
    // gets object
    assert.equal((await chatterNet1.getObjectDoc(note.message.id))?.id, note.message.id);
    assert.equal((await chatterNet1.getObjectDoc(note.objects[0].id))?.id, note.objects[0].id);
    // iterates own message
    const messages1 = await listMessages(await chatterNet1.buildMessageIter());
    assert.ok(new Set(messages1.map((x) => x.id)).has(note.message.id));

    // did2 follows did1
    await chatterNet2.postMessageObjectDoc(
      await chatterNet2.newFollow(ChatterNet.actorFromDid(did1))
    );
    // iterates message
    const messages2 = await listMessages(await chatterNet2.buildMessageIter());
    assert.ok(new Set(messages2.map((x) => x.id)).has(note.message.id));
    // views message
    const viewMessage = await chatterNet2.getOrNewViewMessage(note.message);
    assert.ok(viewMessage);
    await chatterNet2.postMessageObjectDoc({ message: viewMessage, objects: [] });

    // did3 follows did2
    await chatterNet3.postMessageObjectDoc(
      await chatterNet3.newFollow(ChatterNet.actorFromDid(did2))
    );
    // did3 see view
    const messages3 = await listMessages(await chatterNet2.buildMessageIter());
    assert.ok(new Set(messages3.map((x) => x.id)).has(viewMessage.id));
  });

  it("posts and gets messages with local", async () => {
    await ChatterNet.clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", []);
    // did1 posts
    const note = await chatterNet1.newNote("Hi!");
    await chatterNet1.storeMessageObjectDoc(note);
    // gets object
    assert.equal((await chatterNet1.getObjectDoc(note.message.id))?.id, note.message.id);
    assert.equal((await chatterNet1.getObjectDoc(note.objects[0].id))?.id, note.objects[0].id);
    // iterates own message
    const messages1 = await listMessages(await chatterNet1.buildMessageIter());
    assert.ok(new Set(messages1.map((x) => x.id)).has(note.message.id));
  });

  it("unstores local message", async () => {
    await ChatterNet.clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", []);
    // did1 posts
    const note = await chatterNet1.newNote("Hi!");
    await chatterNet1.storeMessageObjectDoc(note);
    // can retrieve message
    assert.equal((await chatterNet1.getObjectDoc(note.message.id))?.id, note.message.id);
    assert.equal((await chatterNet1.getObjectDoc(note.objects[0].id))?.id, note.objects[0].id);
    assert.equal((await listMessages(await chatterNet1.buildMessageIter())).length, 2);
    // message is not deleted
    assert.ok(!(await chatterNet1.messageIsDeleted(note.message.id)));
    // removes message
    await chatterNet1.deleteMessageLocal(note.message.id);
    // message is deleted
    assert.ok(await chatterNet1.messageIsDeleted(note.message.id));
    // can no longer retrieve message object
    assert.ok(!(await chatterNet1.getObjectDoc(note.message.id)));
    assert.ok(!(await chatterNet1.getObjectDoc(note.objects[0].id)));
    // no longer iterates message
    assert.equal((await listMessages(await chatterNet1.buildMessageIter())).length, 1);
  });

  it("builds message affinity", async () => {
    await ChatterNet.clearDbs();
    const did1 = await ChatterNet.newAccount(await DidKey.newKey(), "name1", "abc");
    const did2 = await ChatterNet.newAccount(await DidKey.newKey(), "name2", "abc");
    const did3 = await ChatterNet.newAccount(await DidKey.newKey(), "name3", "abc");
    const chatterNet1 = await ChatterNet.new(did1, "abc", defaultServers);
    const chatterNet2 = await ChatterNet.new(did2, "abc", defaultServers);
    const chatterNet3 = await ChatterNet.new(did3, "abc", defaultServers);

    // did1 posts
    const { message: blankMessage } = await chatterNet1.newNote("Hi!", []);
    const { message: noteMessage } = await chatterNet1.newNote("Hi!");
    assert.deepEqual(await chatterNet1.buildMessageAffinity(blankMessage), {
      fromContact: true,
      inAudience: false,
    });
    assert.deepEqual(await chatterNet1.buildMessageAffinity(noteMessage), {
      fromContact: true,
      inAudience: true,
    });

    // did2 follows did1
    await chatterNet2.newFollow(ChatterNet.actorFromDid(did1));
    assert.deepEqual(await chatterNet2.buildMessageAffinity(noteMessage), {
      fromContact: true,
      inAudience: true,
    });
    const viewMessage = await chatterNet2.getOrNewViewMessage(noteMessage);
    assert.ok(viewMessage);

    // did3 follows did2
    await chatterNet3.newFollow(ChatterNet.actorFromDid(did2));
    assert.deepEqual(await chatterNet3.buildMessageAffinity(noteMessage), {
      fromContact: false,
      inAudience: false,
    });
    assert.deepEqual(await chatterNet3.buildMessageAffinity(viewMessage), {
      fromContact: true,
      inAudience: true,
    });
  });

  it("gets local did", async () => {
    await ChatterNet.clearDbs();
    const did = await ChatterNet.newAccount(await DidKey.newKey(), "some name", "abc");
    const chatterNet = await ChatterNet.new(did, "abc", defaultServers);
    assert.equal(chatterNet.getLocalDid(), did);
  });

  it("gets local name", async () => {
    await ChatterNet.clearDbs();
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
