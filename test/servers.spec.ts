import * as DidKey from "../src/didkey.js";
import * as Messages from "../src/messages.js";
import { Servers } from "../src/servers.js";
import * as assert from "assert";

describe("servers", () => {
  const originalFetch = global.fetch;

  function resetFetch() {
    global.fetch = originalFetch;
  }

  it("posts messages only once", async () => {
    resetFetch();
    const key = await DidKey.newKey();
    const did = DidKey.didFromKey(key);
    const urls = ["http://a.example", "http://b.example"];
    const requestedUrls: string[] = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method != "POST") return new Response(null, { status: 500 });
      requestedUrls.push(request.url.toString());
      return new Response();
    };
    const servers = await Servers.fromUrls(urls);
    const message = await Messages.newMessage(did, ["urn:cid:a"], "Create", null, key);
    await servers.postMessage(message, did);
    await servers.postMessage(message, did);
    assert.deepEqual(requestedUrls, [
      `http://a.example/${did}/actor/outbox`,
      `http://b.example/${did}/actor/outbox`,
    ]);
  });

  it("posts objects only once", async () => {
    resetFetch();
    const urls = ["http://a.example", "http://b.example"];
    const requestedUrls: string[] = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method != "POST") return new Response(null, { status: 500 });
      requestedUrls.push(request.url.toString());
      return new Response();
    };
    const servers = await Servers.fromUrls(urls);
    const objectDoc = await Messages.newObjectDoc("Note");
    await servers.postObjectDoc(objectDoc);
    await servers.postObjectDoc(objectDoc);
    assert.deepEqual(requestedUrls, [
      `http://a.example/${objectDoc.id}`,
      `http://b.example/${objectDoc.id}`,
    ]);
  });

  it("gets an object", async () => {
    resetFetch();
    const urls = ["http://a.example"];
    const objectDoc = await Messages.newObjectDoc("Note");
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method === "GET" && request.url.toString() === `http://a.example/${objectDoc.id}`)
        return new Response(JSON.stringify(objectDoc));
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromUrls(urls);

    const returnedObjectDoc = await servers.getObjectDoc(objectDoc.id);
    assert.deepEqual(returnedObjectDoc, objectDoc);
  });

  it("get object from server that already had it", async () => {
    resetFetch();
    const urls = ["http://a.example", "http://b.example"];
    let requestedUrls: string[] = [];
    const objectDoc = await Messages.newObjectDoc("Note");
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      requestedUrls.push(request.url.toString());
      if (request.method === "GET" && request.url.toString() === `http://b.example/${objectDoc.id}`)
        return new Response(JSON.stringify(objectDoc));
      if (request.method === "GET" && request.url.toString() === `http://a.example/${objectDoc.id}`)
        return new Response(null, { status: 404 });
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromUrls(urls);
    // tries both URLs before finding the object
    await servers.getObjectDoc(objectDoc.id);
    assert.deepEqual(requestedUrls, [
      `http://a.example/${objectDoc.id}`,
      `http://b.example/${objectDoc.id}`,
    ]);
    // directly asks b since it knows it has the object
    requestedUrls = [];
    await servers.getObjectDoc(objectDoc.id);
    assert.deepEqual(requestedUrls, [`http://b.example/${objectDoc.id}`]);
  });

  it("doesnt get invalid object", async () => {
    resetFetch();
    const urls = ["http://a.example"];
    const objectDoc = await Messages.newObjectDoc("Note");
    // invalidates the object
    objectDoc.id = "urn:cid:abc";
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method === "GET" && request.url.toString() === `http://a.example/${objectDoc.id}`)
        return new Response(JSON.stringify(objectDoc));
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromUrls(urls);

    const returnedObjectDoc = await servers.getObjectDoc(objectDoc.id);
    assert.ok(!returnedObjectDoc);
  });

  it("gets an actor", async () => {
    resetFetch();
    const key = await DidKey.newKey();
    const did = DidKey.didFromKey(key);
    const urls = ["http://a.example"];
    const actor = await Messages.newActor(did, "Person", key);
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method === "GET" && request.url.toString() === `http://a.example/${actor.id}`)
        return new Response(JSON.stringify(actor));
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromUrls(urls);
    const returnedActor = await servers.getActor(actor.id);
    assert.deepEqual(returnedActor, actor);
  });

  it("doesnt get an invalid actor", async () => {
    resetFetch();
    const key = await DidKey.newKey();
    const did = DidKey.didFromKey(key);
    const urls = ["http://a.example"];
    const actor = await Messages.newActor(did, "Person", key);
    actor.id = "did:example:a";
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method === "GET" && request.url.toString() === `http://a.example/${actor.id}`)
        return new Response(JSON.stringify(actor));
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromUrls(urls);
    const returnedActor = await servers.getActor(actor.id);
    assert.ok(!returnedActor);
  });

  it("doesnt get invalid actor", async () => {
    resetFetch();
  });

  it("gets inbox messages", async () => {
    resetFetch();
    const key = await DidKey.newKey();
    const did = DidKey.didFromKey(key);
    const urls = ["http://a.example"];
    const message1 = await Messages.newMessage(did, ["urn:cid:a"], "Create", null, key);
    const message2 = await Messages.newMessage(did, ["urn:cid:b"], "Create", null, key);
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (
        request.method === "GET" &&
        request.url.toString() === `http://a.example/${did}/actor/inbox`
      )
        return new Response(JSON.stringify({ orderedItems: [message1, message2] }));
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromUrls(urls);
    const returnedMessages = await servers.getInbox("http://a.example", did);
    assert.equal(message1.id, returnedMessages[0].id);
    assert.equal(message2.id, returnedMessages[1].id);
  });

  it("doesnt get inbox invalid messages", async () => {
    resetFetch();
    const key = await DidKey.newKey();
    const did = DidKey.didFromKey(key);
    const urls = ["http://a.example"];
    const message1 = await Messages.newMessage(did, ["urn:cid:a"], "Create", null, key);
    message1.id = "urn:cid:abc";
    const message2 = await Messages.newMessage(did, ["urn:cid:b"], "Create", null, key);
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (
        request.method === "GET" &&
        request.url.toString() === `http://a.example/${did}/actor/inbox`
      )
        return new Response(JSON.stringify({ orderedItems: [message1, message2] }));
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromUrls(urls);
    const returnedMessages = await servers.getInbox("http://a.example", did);
    assert.equal(message2.id, returnedMessages[0].id);
  });
});
