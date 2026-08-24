import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

const hasPermissionMock = mock(async () => false);
mock.module("@/core/discord/permissions", () => ({
  hasPermission: hasPermissionMock,
}));

import { AiChatAllowService } from "@/features/ai/services/ai-chat-allow.service";

describe("AiChatAllowService", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
    hasPermissionMock.mockClear();
    hasPermissionMock.mockImplementation(async () => false);
    setMutationResult("insert", undefined);
    setMutationResult("delete", undefined);
  });

  describe("list", () => {
    it("returns entries from the database and caches them", async () => {
      setQueryResult("findMany", [
        { type: "role", entityId: "r1" },
        { type: "special", entityId: "mods" },
      ]);
      expect(await AiChatAllowService.list("g1")).toEqual([
        { type: "role", entityId: "r1" },
        { type: "special", entityId: "mods" },
      ]);
      setQueryResult("findMany", []);
      expect(await AiChatAllowService.list("g1")).toHaveLength(2);
    });
  });

  describe("add", () => {
    it("returns exists when the entry is already there", async () => {
      setQueryResult("findFirst", { type: "special", entityId: "mods" });
      expect(await AiChatAllowService.add("g1", "special", "mods")).toBe("exists");
    });

    it("inserts a new entry", async () => {
      setQueryResult("findFirst", null);
      expect(await AiChatAllowService.add("g1", "member", "u1")).toBe("added");
    });
  });

  describe("remove", () => {
    it("returns false when missing", async () => {
      setQueryResult("findFirst", null);
      expect(await AiChatAllowService.remove("g1", "member", "u1")).toBe(false);
    });

    it("deletes an existing entry", async () => {
      setQueryResult("findFirst", { type: "member", entityId: "u1" });
      expect(await AiChatAllowService.remove("g1", "member", "u1")).toBe(true);
    });
  });

  describe("canUse", () => {
    it("allows anyone when the list is empty", async () => {
      setQueryResult("findMany", []);
      expect(await AiChatAllowService.canUse(createMockMessage())).toBe(true);
      expect(hasPermissionMock).not.toHaveBeenCalled();
    });

    it("allows a matching role and skips hasPermission", async () => {
      setQueryResult("findMany", [{ type: "role", entityId: "staff" }]);
      const msg = createMockMessage();
      (msg.member as { roles: { cache: { has: (id: string) => boolean } } }).roles =
        {
          cache: { has: (id: string) => id === "staff" },
        };
      expect(await AiChatAllowService.canUse(msg)).toBe(true);
      expect(hasPermissionMock).not.toHaveBeenCalled();
    });

    it("checks mods via hasPermission", async () => {
      setQueryResult("findMany", [{ type: "special", entityId: "mods" }]);
      hasPermissionMock.mockImplementation(async () => true);
      expect(await AiChatAllowService.canUse(createMockMessage())).toBe(true);
      expect(hasPermissionMock).toHaveBeenCalled();
    });
  });
});
