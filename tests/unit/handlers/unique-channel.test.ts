import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { enforceUniqueChannel } from "@/features/unique-channel/handlers/enforce.handler";

describe("enforceUniqueChannel", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in a guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await enforceUniqueChannel(msg);
  });

  it("returns when no unique channel configured", async () => {
    setTableResult("uniqueChannelsTable", "findFirst", null);
    const msg = createMockMessage();
    await enforceUniqueChannel(msg);
  });

  it("returns when message is not in the unique channel", async () => {
    setTableResult("uniqueChannelsTable", "findFirst", {
      channelId: "999",
      emoji: "✅",
    });
    const msg = createMockMessage();
    await enforceUniqueChannel(msg);
  });

  it("reacts and stores when first message in unique channel", async () => {
    setTableResult("uniqueChannelsTable", "findFirst", {
      channelId: "222222222222222222",
      emoji: "✅",
    });
    setTableResult("uniqueMessagesTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = createMockMessage({
      channelId: "222222222222222222",
    });
    await enforceUniqueChannel(msg);
  });

  it("resets user when existing message channel is not sendable", async () => {
    setTableResult("uniqueChannelsTable", "findFirst", {
      channelId: "222222222222222222",
      emoji: "✅",
    });
    setTableResult("uniqueMessagesTable", "findFirst", { messageId: "old" });
    setTableResult("uniqueMessagesTable", "findFirst", { messageId: "old" });
    setMutationResult("delete", { rowsAffected: 1 });
    setMutationResult("insert", undefined);
    const msg = createMockMessage({
      channelId: "222222222222222222",
    });
    Object.defineProperty(msg, "channel", {
      value: { isSendable: () => false, messages: { fetch: mock(async () => null) } },
      configurable: true,
    });
    await enforceUniqueChannel(msg);
  });
});
