import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { handleUniqueCommand } from "@/features/unique-channel/commands/unique.command";

describe("handleUniqueCommand", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await handleUniqueCommand(msg, ["set"], "m!");
  });

  it("shows usage when no args", async () => {
    const msg = createMockMessage();
    await handleUniqueCommand(msg, [], "m!");
  });

  it("shows usage for unknown subcommand", async () => {
    const msg = createMockMessage();
    await handleUniqueCommand(msg, ["unknown"], "m!");
  });

  it("set requires channel", async () => {
    const msg = createMockMessage();
    await handleUniqueCommand(msg, ["set"], "m!");
  });

  it("set invalid channel", async () => {
    const msg = createMockMessage();
    (msg.guild as unknown as { channels: { cache: { get: (id: string) => unknown } } }).channels = {
      cache: { get: () => null },
    };
    await handleUniqueCommand(msg, ["set", "bad"], "m!");
  });

  it("set success", async () => {
    setTableResult("uniqueChannelsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    setMutationResult("delete", { rowsAffected: 0 });
    const msg = createMockMessage();
    (msg.guild as unknown as { channels: { cache: { get: (id: string) => unknown } } }).channels = {
      cache: { get: () => ({}) },
    };
    await handleUniqueCommand(msg, ["set", "123456789012345678"], "m!");
  });

  it("set with mention", async () => {
    setTableResult("uniqueChannelsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    setMutationResult("delete", { rowsAffected: 0 });
    const msg = createMockMessage();
    (msg.guild as unknown as { channels: { cache: { get: (id: string) => unknown } } }).channels = {
      cache: { get: () => ({}) },
    };
    await handleUniqueCommand(msg, ["set", "<#123456789012345678>"], "m!");
  });

  it("emoji requires value", async () => {
    const msg = createMockMessage();
    await handleUniqueCommand(msg, ["emoji"], "m!");
  });

  it("emoji not configured", async () => {
    setTableResult("uniqueChannelsTable", "findFirst", null);
    const msg = createMockMessage();
    await handleUniqueCommand(msg, ["emoji", "🎉"], "m!");
  });

  it("emoji success", async () => {
    setTableResult("uniqueChannelsTable", "findFirst", { channelId: "c1", emoji: "✅" });
    setMutationResult("update", undefined);
    const msg = createMockMessage();
    await handleUniqueCommand(msg, ["emoji", "🎉"], "m!");
  });

  it("reset requires user", async () => {
    const msg = createMockMessage();
    await handleUniqueCommand(msg, ["reset"], "m!");
  });

  it("reset by id", async () => {
    setTableResult("uniqueMessagesTable", "findFirst", { messageId: "m1" });
    setMutationResult("delete", { rowsAffected: 1 });
    const msg = createMockMessage();
    await handleUniqueCommand(msg, ["reset", "123456789012345678"], "m!");
  });

  it("reset not found", async () => {
    setTableResult("uniqueMessagesTable", "findFirst", null);
    const msg = createMockMessage();
    await handleUniqueCommand(msg, ["reset", "123456789012345678"], "m!");
  });

  it("reset by mention", async () => {
    setTableResult("uniqueMessagesTable", "findFirst", { messageId: "m1" });
    setMutationResult("delete", { rowsAffected: 1 });
    const msg = createMockMessage();
    await handleUniqueCommand(msg, ["reset", "<@123456789012345678>"], "m!");
  });
});
