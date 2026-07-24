import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setQueryResult, setTableResult, clear } = createMockDb();

mock.module("@/db/connection", () => ({ db }));
mock.module("@/core/discord/ignored-channels", () => ({
  isIgnored: async () => false,
  invalidateIgnoredCache: () => {},
}));

import { monitorImages } from "@/features/images/handlers/monitor.handler";

describe("monitorImages", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
    setTableResult("whitelistsTable", "findMany", []);
  });

  it("returns when not in a guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await monitorImages(msg);
  });

  it("returns when no images configured", async () => {
    setQueryResult("findMany", []);
    const msg = createMockMessage({
      attachments: [{ url: "https://x.com/i.png" }],
    });
    await monitorImages(msg);
  });

  it("skips non-image attachments", async () => {
    setQueryResult("findMany", []);
    const msg = createMockMessage({
      attachments: [
        { url: "https://x.com/file.txt", contentType: "text/plain" },
      ],
    });
    await monitorImages(msg);
  });

  it("returns when message has no images", async () => {
    setQueryResult("findMany", [
      {
        id: 1,
        guildId: "g1",
        hash: "abc",
        phash: null,
        ahash: null,
        colorSig: null,
        width: null,
        height: null,
        url: "u",
        name: "n",
      },
    ]);
    const msg = createMockMessage({ content: "no image here" });
    await monitorImages(msg);
  });
});
