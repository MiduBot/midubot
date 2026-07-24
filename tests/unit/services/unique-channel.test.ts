import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { UniqueChannelService } from "@/features/unique-channel";

describe("UniqueChannelService", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  describe("getConfig", () => {
    it("returns null when no record", async () => {
      setQueryResult("findFirst", null);
      expect(await UniqueChannelService.getConfig("g1")).toBeNull();
    });

    it("returns config from DB", async () => {
      setQueryResult("findFirst", { channelId: "c1", emoji: "🎉" });
      const cfg = await UniqueChannelService.getConfig("g1");
      expect(cfg).toEqual({ channelId: "c1", emoji: "🎉" });
    });

    it("caches the result", async () => {
      setQueryResult("findFirst", { channelId: "c1", emoji: "🎉" });
      await UniqueChannelService.getConfig("g1");
      setQueryResult("findFirst", { channelId: "c2", emoji: "✅" });
      expect(await UniqueChannelService.getConfig("g1")).toEqual({
        channelId: "c1",
        emoji: "🎉",
      });
    });

    it("re-queries when previous result was null (does not cache negatives)", async () => {
      setQueryResult("findFirst", null);
      await UniqueChannelService.getConfig("g1");
      setQueryResult("findFirst", { channelId: "c2", emoji: "✅" });
      expect(await UniqueChannelService.getConfig("g1")).toEqual({
        channelId: "c2",
        emoji: "✅",
      });
    });
  });

  describe("setChannel", () => {
    it("updates when existing", async () => {
      setQueryResult("findFirst", { channelId: "old" });
      setMutationResult("update", undefined);
      setMutationResult("delete", { rowsAffected: 0 });
      await UniqueChannelService.setChannel("g1", "new");
    });

    it("inserts when no record", async () => {
      setQueryResult("findFirst", null);
      setMutationResult("insert", undefined);
      setMutationResult("delete", { rowsAffected: 0 });
      await UniqueChannelService.setChannel("g1", "new");
    });
  });

  describe("setEmoji", () => {
    it("throws when no record", async () => {
      setQueryResult("findFirst", null);
      await expect(
        UniqueChannelService.setEmoji("g1", "🎉"),
      ).rejects.toThrow("No unique channel configured");
    });

    it("updates when record exists", async () => {
      setQueryResult("findFirst", { channelId: "c1", emoji: "✅" });
      setMutationResult("update", undefined);
      await UniqueChannelService.setEmoji("g1", "🎉");
    });
  });

  describe("getUserMessage", () => {
    it("returns null when no record", async () => {
      setQueryResult("findFirst", null);
      expect(
        await UniqueChannelService.getUserMessage("g1", "u1"),
      ).toBeNull();
    });

    it("returns messageId", async () => {
      setQueryResult("findFirst", { messageId: "m1" });
      expect(
        await UniqueChannelService.getUserMessage("g1", "u1"),
      ).toBe("m1");
    });
  });

  describe("setUserMessage", () => {
    it("inserts a record", async () => {
      setMutationResult("insert", undefined);
      await UniqueChannelService.setUserMessage("g1", "u1", "m1");
    });
  });

  describe("resetUser", () => {
    it("returns deleted=false when no record", async () => {
      setQueryResult("findFirst", null);
      const r = await UniqueChannelService.resetUser("g1", "u1");
      expect(r).toEqual({ deleted: false });
    });

    it("deletes and returns deleted=true", async () => {
      setQueryResult("findFirst", { messageId: "m1" });
      setMutationResult("delete", { rowsAffected: 1 });
      const r = await UniqueChannelService.resetUser("g1", "u1");
      expect(r).toEqual({ deleted: true });
    });
  });
});
