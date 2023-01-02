import { PageIter } from "../src/pageiter.js";
import { Servers } from "../src/servers.js";
import * as assert from "assert";

describe("page iter", () => {
  it("iterates pages from multiple servers", async () => {
    const servers = Servers.fromInfos([
      { url: "http://a.example", did: "did:example:a" },
      { url: "http://b.example", did: "did:example:b" },
    ]);

    servers.getPaginated = async (
      uri: string,
      serverUrl: string,
      startIdx?: number,
      pageSize?: number
    ) => {
      pageSize = pageSize ? pageSize : 1;
      if (!uri.startsWith("resource")) throw Error("invalid resource");

      if (serverUrl === "http://a.example") {
        let items = [];
        if (startIdx == null || startIdx === 3) items = ["a3", "a2", "a1"];
        else if (startIdx === 2) items = ["a2", "a2"];
        else if (startIdx === 1) items = ["a1"];
        else throw Error("invalid start idx");

        if (pageSize != null) items = items.slice(0, +pageSize);

        let nextStartIdx = undefined;
        if (items[items.length - 1] == "a3") nextStartIdx = 2;
        if (items[items.length - 1] == "a2") nextStartIdx = 1;

        return { items, nextStartIdx };
      } else if (serverUrl === "http://b.example") {
        let items = [];
        if (startIdx == null || startIdx === 2) items = ["b2", "b1"];
        else if (startIdx === 1) items = ["b1"];
        else throw Error("invalid start idx");

        if (pageSize != null) items = items.slice(0, +pageSize);

        let nextStartIdx = undefined;
        if (items[items.length - 1] == "b2") nextStartIdx = 1;

        return { items, nextStartIdx };
      } else throw Error("invalid server URL");
    };

    const uri = "resource";
    const isString = function (x: unknown): x is string {
      return typeof x === "string";
    };
    const pageIter = PageIter.new<string>(uri, servers, 2, isString);

    const page1: string[] = [];
    const page2: string[] = [];
    for await (const item of pageIter.pageItems()) {
      page1.push(item);
    }
    for await (const item of pageIter.pageItems()) {
      page2.push(item);
    }
    assert.deepEqual(page1, ["a3", "a2", "b2", "b1"]);
    assert.deepEqual(page2, ["a1"]);
  });
});
