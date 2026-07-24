import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setQueryResult, clear } = createMockDb();

mock.module("@/db/connection", () => ({ db }));

import { WhitelistService } from "@/features/whitelist";

describe("WhitelistService", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  describe("getWhitelist", () => {
    it("returns entries from the database", async () => {
      setQueryResult("findMany", [
        { id: 1, guildId: "g1", type: "role", entityId: "r1" },
        { id: 2, guildId: "g1", type: "member", entityId: "u1" },
      ]);

      const list = await WhitelistService.getWhitelist("g1");

      expect(list).toHaveLength(2);
      expect(list[0].type).toBe("role");
      expect(list[1].entityId).toBe("u1");
    });

    it("caches results between calls", async () => {
      setQueryResult("findMany", [
        { id: 1, guildId: "g1", type: "role", entityId: "r1" },
      ]);

      await WhitelistService.getWhitelist("g1");
      setQueryResult("findMany", []);
      const cached = await WhitelistService.getWhitelist("g1");

      expect(cached).toHaveLength(1);
    });
  });

  describe("addWhitelist", () => {
    it("throws when the entry already exists", async () => {
      setQueryResult("findFirst", {
        id: 1,
        guildId: "g1",
        type: "role",
        entityId: "r1",
      });

      await expect(
        WhitelistService.addWhitelist("g1", "role", "r1"),
      ).rejects.toThrow("Already exists in whitelist");
    });

    it("inserts a new entry when not duplicated", async () => {
      setQueryResult("findFirst", null);

      await expect(
        WhitelistService.addWhitelist("g1", "permission", "p1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("removeWhitelist", () => {
    it("deletes by guild and entity id", async () => {
      setQueryResult("findFirst", null);

      await expect(
        WhitelistService.removeWhitelist("g1", "r1"),
      ).resolves.toBeUndefined();
    });
  });
});
