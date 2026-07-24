import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createMockDb } from "../../mocks/db";

const { db, setQueryResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { isIgnored } from "@/core/discord/ignored-channels";
import { appCache } from "@/core/cache";

beforeEach(() => {
  clear();
  appCache.clear();
});

describe("isIgnored", () => {
  it("returns false when no ignored rows", async () => {
    setQueryResult("findMany", []);
    expect(await isIgnored("g1", { id: "c1", parentId: null })).toBe(false);
  });

  it("returns true when the channel id is ignored", async () => {
    setQueryResult("findMany", [
      { id: 1, guildId: "g1", targetId: "c1", targetType: "channel" },
    ]);
    expect(await isIgnored("g1", { id: "c1", parentId: null })).toBe(true);
  });

  it("returns true when the parent category id is ignored", async () => {
    setQueryResult("findMany", [
      { id: 1, guildId: "g1", targetId: "catX", targetType: "category" },
    ]);
    expect(await isIgnored("g1", { id: "c1", parentId: "catX" })).toBe(true);
  });
});
