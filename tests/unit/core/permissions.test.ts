import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { hasPermission } from "@/core/discord/permissions";

describe("hasPermission", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns false when no member", async () => {
    const msg = createMockMessage();
    (msg as { member: null }).member = null;
    expect(await hasPermission(msg)).toBe(false);
  });

  it("returns true when member has ManageMessages", async () => {
    const msg = createMockMessage();
    (msg.member as { permissions: { has: (p: string) => boolean } }).permissions = {
      has: (p: string) => p === "ManageMessages",
    };
    expect(await hasPermission(msg)).toBe(true);
  });

  it("returns true when whitelisted as member", async () => {
    setTableResult("whitelistsTable", "findMany", [
      { id: 1, guildId: "g1", type: "member", entityId: "111111111111111111" },
    ]);
    const msg = createMockMessage();
    expect(await hasPermission(msg)).toBe(true);
  });

  it("returns true when whitelisted as role", async () => {
    setTableResult("whitelistsTable", "findMany", [
      { id: 1, guildId: "g1", type: "role", entityId: "r1" },
    ]);
    const msg = createMockMessage();
    (msg.member as { roles: { cache: { has: (id: string) => boolean } } }).roles = {
      cache: { has: (id: string) => id === "r1", size: 1 },
    };
    expect(await hasPermission(msg)).toBe(true);
  });

  it("returns true when whitelisted as permission", async () => {
    setTableResult("whitelistsTable", "findMany", [
      { id: 1, guildId: "g1", type: "permission", entityId: "ManageMessages" },
    ]);
    const msg = createMockMessage();
    (msg.member as { permissions: { has: (p: string) => boolean } }).permissions = {
      has: (p: string) => p === "ManageMessages",
    };
    expect(await hasPermission(msg)).toBe(true);
  });

  it("returns false when not whitelisted", async () => {
    setTableResult("whitelistsTable", "findMany", []);
    const msg = createMockMessage();
    expect(await hasPermission(msg)).toBe(false);
  });
});
