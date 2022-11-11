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

  it("get object from server that already had it", async () => {
    resetFetch();
    const urls = ["http://a.example", "http://b.example"];
    let requestedUrls: string[] = [];
    const objectDoc = await Messages.newObjectDoc("Note");
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method != "GET") return new Response(null, { status: 500 });
      requestedUrls.push(request.url.toString());
      if (request.url.toString() === `http://b.example/${objectDoc.id}`)
        return new Response(JSON.stringify(objectDoc));
      if (request.url.toString() === `http://a.example/${objectDoc.id}`)
        return new Response(null, { status: 404 });
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromUrls(urls);

    const returnedObjectDoc1 = await servers.getObjectDoc(objectDoc.id);
    assert.deepEqual(returnedObjectDoc1, objectDoc);
    assert.deepEqual(requestedUrls, [
      `http://a.example/${objectDoc.id}`,
      `http://b.example/${objectDoc.id}`,
    ]);

    requestedUrls = [];
    const returnedObjectDoc2 = await servers.getObjectDoc(objectDoc.id);
    assert.deepEqual(returnedObjectDoc2, objectDoc);
    assert.deepEqual(requestedUrls, [`http://b.example/${objectDoc.id}`]);
  });

  it("get inbox", async () => {
    resetFetch();
    const key = await DidKey.newKey();
    const did = DidKey.didFromKey(key);
    const urls = ["http://a.example", "http://b.example"];
    const message = await Messages.newMessage(did, ["urn:cid:a"], "Create", null, key);
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method != "GET") return new Response(null, { status: 500 });
      if (request.url.toString() === `http://a.example/${did}/actor/inbox`)
        return new Response(JSON.stringify({ orderedItems: [message] }));
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromUrls(urls);
    const returnedMessages = await servers.getInbox("http://a.example", did);
    assert.equal(message.id, returnedMessages[0].id);
  });
});
