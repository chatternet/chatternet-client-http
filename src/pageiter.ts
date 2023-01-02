import type { PageOut, Servers } from "./servers.js";
import { get } from "lodash-es";

interface ServerCursor {
  url: string;
  startIdx: number | undefined;
  exhausted: boolean;
}

/**
 * Iterate over paged resources from multiple servers.
 */
export class PageIter<T> {
  constructor(
    /** The resource to pull from the servers. */
    readonly uri: string,
    /** The servers to pull from. */
    readonly servers: Servers,
    /** The amount of items to pull in one request from each server. */
    readonly pageSize: number,
    /** Type guard to restrict items to the type T. */
    readonly guard: (x: unknown) => x is T,
    /** Tracks pagination per server. */
    readonly serverCursors: ServerCursor[],
    /** Tracks IDs of items seen by this iterator. */
    readonly skipIds: Set<string>
  ) {}

  static new<T>(
    uri: string,
    servers: Servers,
    pageSize: number,
    guard: (x: unknown) => x is T
  ): PageIter<T> {
    const cursors = [...servers.urlsServer.values()].map((x) => ({
      url: x.url,
      startIdx: undefined,
      exhausted: false,
    }));
    return new PageIter(uri, servers, pageSize, guard, cursors, new Set());
  }

  async *pageItems(): AsyncGenerator<T> {
    const numServers = this.serverCursors.length;
    for (let serverIdx = 0; serverIdx < numServers; serverIdx++) {
      const { url, startIdx, exhausted } = this.serverCursors[serverIdx];
      if (exhausted) continue;
      let out: PageOut | undefined = undefined;
      try {
        out = await this.servers.getPaginated(this.uri, url, startIdx, this.pageSize);
      } catch {}
      if (out == null || out.nextStartIdx == null || out.items.length <= 0)
        this.serverCursors[serverIdx].exhausted = true;
      if (out == null) continue;
      this.serverCursors[serverIdx].startIdx = out.nextStartIdx;
      for (const item of out.items) {
        const id = typeof item === "string" ? item : get(item, "id");
        if (typeof id === "string") {
          if (this.skipIds.has(id)) continue;
          this.skipIds.add(id);
        }
        if (!this.guard(item)) continue;
        yield item;
      }
    }
  }
}
