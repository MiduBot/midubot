import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { LogChannelService } from "@/features/log-channel";

describe("LogChannelService", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  describe("getLogChannel", () => {
    it("returns null when no record", async () => {
      setQueryResult("findFirst", null);
      expect(await LogChannelService.getLogChannel("g1")).toBeNull();
    });

    it("returns channelId from DB and caches it", async () => {
      setQueryResult("findFirst", { channelId: "c1" });
      expect(await LogChannelService.getLogChannel("g1")).toBe("c1");
    });

    it("returns cached value", async () => {
      setQueryResult("findFirst", { channelId: "c1" });
      await LogChannelService.getLogChannel("g1");
      setQueryResult("findFirst", { channelId: "other" });
      expect(await LogChannelService.getLogChannel("g1")).toBe("c1");
    });
  });

  describe("setLogChannel", () => {
    it("updates when existing record", async () => {
      setQueryResult("findFirst", { channelId: "old" });
      setMutationResult("update", undefined);
      await LogChannelService.setLogChannel("g1", "new");
      expect(await LogChannelService.getLogChannel("g1")).toBe("new");
    });

    it("inserts when no record", async () => {
      setQueryResult("findFirst", null);
      setMutationResult("insert", undefined);
      await LogChannelService.setLogChannel("g1", "new");
      expect(await LogChannelService.getLogChannel("g1")).toBe("new");
    });
  });

  describe("removeLogChannel", () => {
    it("removes and clears cache", async () => {
      setQueryResult("findFirst", { channelId: "c1" });
      await LogChannelService.setLogChannel("g1", "c1");
      setMutationResult("delete", { rowsAffected: 1 });
      await LogChannelService.removeLogChannel("g1");
      setQueryResult("findFirst", null);
      expect(await LogChannelService.getLogChannel("g1")).toBeNull();
    });
  });
});
