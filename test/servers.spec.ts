import * as DidKey from "../src/didkey.js";
import * as Model from "../src/model/index.js";
import { Servers } from "../src/servers.js";
import * as assert from "assert";

describe("servers", () => {
  const originalFetch = global.fetch;

  function resetFetch() {
    global.fetch = originalFetch;
  }

  it("posts messages", async () => {
    resetFetch();
    const key = await DidKey.newKey();
    const did = DidKey.didFromKey(key);
    const infos = [
      { url: "http://a.example", did: "did:example:a" },
      { url: "http://b.example", did: "did:example:b" },
    ];
    const requestedUrls: string[] = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method != "POST") return new Response(null, { status: 500 });
      requestedUrls.push(request.url.toString());
      return new Response();
    };
    const servers = await Servers.fromInfos(infos);
    const message = await Model.newMessage(did, ["urn:cid:a"], "Create", null, key);
    await servers.postMessage(message, did);
    assert.deepEqual(requestedUrls, [
      `http://a.example/ap/${did}/actor/outbox`,
      `http://b.example/ap/${did}/actor/outbox`,
    ]);
  });

  it("posts objects", async () => {
    resetFetch();
    const infos = [
      { url: "http://a.example", did: "did:example:a" },
      { url: "http://b.example", did: "did:example:b" },
    ];
    const requestedUrls: string[] = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.method != "POST") return new Response(null, { status: 500 });
      requestedUrls.push(request.url.toString());
      return new Response();
    };
    const servers = await Servers.fromInfos(infos);
    const objectDoc = await Model.newNoteMd1k("Note", "did:example:a");
    await servers.postDocument(objectDoc);
    assert.deepEqual(requestedUrls, [
      `http://a.example/ap/${objectDoc.id}`,
      `http://b.example/ap/${objectDoc.id}`,
    ]);
  });

  it("gets an object", async () => {
    resetFetch();
    const infos = [
      { url: "http://a.example", did: "did:example:a" },
      { url: "http://b.example", did: "did:example:b" },
    ];
    const objectDoc = await Model.newNoteMd1k("Note", "did:example:a");
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (
        request.method === "GET" &&
        request.url.toString() === `http://a.example/ap/${objectDoc.id}`
      )
        return new Response(JSON.stringify(objectDoc));
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromInfos(infos);

    const returnedBody = await servers.getDocument(objectDoc.id);
    assert.deepEqual(returnedBody, JSON.parse(JSON.stringify(objectDoc)));
  });

  it("gets create message for an object", async () => {
    resetFetch();
    const infos = [
      { url: "http://a.example", did: "did:example:a" },
      { url: "http://b.example", did: "did:example:b" },
    ];
    const objectId = "urn:cid:1";
    const jwk = await DidKey.newKey();
    const did = DidKey.didFromKey(jwk);
    const actorId = `${did}/actor`;
    const message = await Model.newMessage(actorId, [objectId], "Create", null, jwk);
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (
        request.method === "GET" &&
        request.url.toString() === `http://a.example/ap/${objectId}/createdBy/${actorId}`
      )
        return new Response(JSON.stringify(message));
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromInfos(infos);

    const returned = await servers.getCreateMessageForDocument(objectId, actorId);
    assert.deepEqual(returned, JSON.parse(JSON.stringify(message)));
  });

  it("get object from server that already had it", async () => {
    resetFetch();
    const infos = [
      { url: "http://a.example", did: "did:example:a" },
      { url: "http://b.example", did: "did:example:b" },
    ];
    let requestedUrls: string[] = [];
    const objectDoc = await Model.newNoteMd1k("Note", "did:example:a");
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      requestedUrls.push(request.url.toString());
      if (
        request.method === "GET" &&
        request.url.toString() === `http://b.example/ap/${objectDoc.id}`
      )
        return new Response(JSON.stringify(objectDoc));
      if (
        request.method === "GET" &&
        request.url.toString() === `http://a.example/ap/${objectDoc.id}`
      )
        return new Response(null, { status: 404 });
      return new Response(null, { status: 500 });
    };
    const servers = await Servers.fromInfos(infos);
    // tries both URLs before finding the object
    await servers.getDocument(objectDoc.id);
    assert.deepEqual(requestedUrls, [
      `http://a.example/ap/${objectDoc.id}`,
      `http://b.example/ap/${objectDoc.id}`,
    ]);
    // directly asks b since it knows it has the object
    requestedUrls = [];
    await servers.getDocument(objectDoc.id);
    assert.deepEqual(requestedUrls, [`http://b.example/ap/${objectDoc.id}`]);
  });

  it("doesnt get invalid actor", async () => {
    resetFetch();
  });

  it("gets collection", async () => {
    resetFetch();

    const infos = [
      { url: "http://a.example", did: "did:example:a" },
      { url: "http://b.example", did: "did:example:b" },
    ];
    const servers = await Servers.fromInfos(infos);

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      const notFound = new Response(null, { status: 404 });
      if (request.method !== "GET") return notFound;
      const url = new URL(request.url);
      if (url.origin !== "http://a.example") return notFound;
      if (url.pathname !== "/ap/resource-uri") return notFound;

      let items = [];
      const startIdx = url.searchParams.get("startIdx");
      if (startIdx == null || startIdx === "3") items = ["item3", "item2", "item1"];
      else if (startIdx === "2") items = ["item2", "item1"];
      else if (startIdx === "1") items = ["item1"];
      else return notFound;

      const pageSize = url.searchParams.get("pageSize");
      if (pageSize != null) items = items.slice(0, +pageSize);

      let nextStartIdx = undefined;
      if (items[items.length - 1] == "item3") nextStartIdx = 2;
      if (items[items.length - 1] == "item2") nextStartIdx = 1;

      return new Response(JSON.stringify({ items, nextStartIdx }));
    };

    {
      const { items, nextStartIdx } = await servers.getPaginated(
        "resource-uri",
        "http://a.example"
      );
      assert.ok(!nextStartIdx);
      assert.deepEqual(items, ["item3", "item2", "item1"]);
    }

    {
      const { items, nextStartIdx } = await servers.getPaginated(
        "resource-uri",
        "http://a.example",
        3
      );
      assert.ok(!nextStartIdx);
      assert.deepEqual(items, ["item3", "item2", "item1"]);
    }

    {
      const { items, nextStartIdx } = await servers.getPaginated(
        "resource-uri",
        "http://a.example",
        undefined,
        2
      );
      assert.ok(!nextStartIdx);
      assert.deepEqual(items, ["item3", "item2"]);
    }

    {
      const { items, nextStartIdx } = await servers.getPaginated(
        "resource-uri",
        "http://a.example",
        2
      );
      assert.ok(!nextStartIdx);
      assert.deepEqual(items, ["item2", "item1"]);
    }

    {
      const { items, nextStartIdx } = await servers.getPaginated(
        "resource-uri",
        "http://a.example",
        2,
        1
      );
      assert.ok(!nextStartIdx);
      assert.deepEqual(items, ["item2"]);
    }
  });
});
