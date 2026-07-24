import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { handleWhitelistCommand } from "@/features/whitelist/commands/whitelist.command";

describe("handleWhitelistCommand", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in a guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await handleWhitelistCommand(msg, ["list"], "m!");
  });

  it("shows usage when no args", async () => {
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, [], "m!");
  });

  it("shows usage for unknown subcommand", async () => {
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["foo"], "m!");
  });

  it("list returns empty", async () => {
    setTableResult("whitelistsTable", "findMany", []);
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["list"], "m!");
  });

  it("list returns entries", async () => {
    setTableResult("whitelistsTable", "findMany", [
      { id: 1, guildId: "g1", type: "role", entityId: "r1" },
      { id: 2, guildId: "g1", type: "member", entityId: "u1" },
      { id: 3, guildId: "g1", type: "permission", entityId: "ManageMessages" },
    ]);
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["list"], "m!");
  });

  it("add requires argument", async () => {
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["add"], "m!");
  });

  it("add by raw id (member)", async () => {
    setTableResult("whitelistsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    (msg.guild as unknown as { roles: { cache: { has: (id: string) => boolean } } }).roles = {
      cache: { has: () => false },
    };
    await handleWhitelistCommand(msg, ["add", "123456789012345678"], "m!");
  });

  it("add by role mention", async () => {
    setTableResult("whitelistsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["add", "<@&123456789012345678>"], "m!");
  });

  it("add by user mention", async () => {
    setTableResult("whitelistsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["add", "<@123456789012345678>"], "m!");
  });

  it("add by nickname", async () => {
    setTableResult("whitelistsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["add", "<@!123456789012345678>"], "m!");
  });

  it("add duplicate throws and shows error", async () => {
    setTableResult("whitelistsTable", "findFirst", {
      id: 1,
      guildId: "g1",
      type: "role",
      entityId: "123456789012345678",
    });
    const msg = createMockMessage();
    (msg.guild as unknown as { roles: { cache: { has: (id: string) => boolean } } }).roles = {
      cache: { has: () => true },
    };
    await handleWhitelistCommand(msg, ["add", "123456789012345678"], "m!");
  });

  it("add shows permission select menu", async () => {
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["add", "permission"], "m!");
  });

  it("remove requires argument", async () => {
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["remove"], "m!");
  });

  it("remove by id", async () => {
    setMutationResult("delete", { rowsAffected: 1 });
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["remove", "123456789012345678"], "m!");
  });

  it("remove by mention", async () => {
    setMutationResult("delete", { rowsAffected: 1 });
    const msg = createMockMessage();
    await handleWhitelistCommand(msg, ["remove", "<@&123456789012345678>"], "m!");
  });
});
