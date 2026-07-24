import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, setQueryResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));
mock.module("@/core/cache", () => ({
  appCache: { get: () => undefined, set: () => {}, delete: () => {} },
}));

import { IgnoredChannelsService } from "@/features/ai-mod/services/ignored-channels.service";

beforeEach(() => clear());

describe("IgnoredChannelsService", () => {
  it("list returns rows for the guild", async () => {
    setQueryResult("findMany", [
      { id: 1, guildId: "g1", targetId: "c1", targetType: "channel" },
    ]);
    const rows = await IgnoredChannelsService.list("g1");
    expect(rows).toHaveLength(1);
    expect(rows[0].targetType).toBe("channel");
  });

  it("add throws when already present", async () => {
    setQueryResult("findFirst", { id: 1, guildId: "g1", targetId: "c1", targetType: "channel" });
    await expect(IgnoredChannelsService.add("g1", "c1", "channel")).rejects.toThrow();
  });

  it("add inserts when not present", async () => {
    setQueryResult("findFirst", undefined);
    await IgnoredChannelsService.add("g1", "c1", "channel");
  });

  it("remove deletes without throwing", async () => {
    await IgnoredChannelsService.remove("g1", "c1");
  });
});
