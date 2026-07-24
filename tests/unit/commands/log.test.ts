import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { handleLogCommand } from "@/features/log-channel/commands/log.command";

describe("handleLogCommand", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in a guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await handleLogCommand(msg, ["#general"], "m!");
  });

  it("shows usage when no args", async () => {
    const msg = createMockMessage();
    await handleLogCommand(msg, [], "m!");
  });

  it("rejects invalid channel id", async () => {
    const msg = createMockMessage();
    await handleLogCommand(msg, ["not-an-id"], "m!");
  });

  it("rejects unknown channel", async () => {
    setTableResult("logChannelsTable", "findFirst", null);
    const msg = createMockMessage();
    (msg.guild as unknown as { channels: { fetch: (id: string) => Promise<unknown> } }).channels = {
      fetch: mock(async () => null),
    };
    await handleLogCommand(msg, ["123456789012345678"], "m!");
  });

  it("rejects non-text channel", async () => {
    const guild = {
      channels: { fetch: mock(async () => ({ type: 2 })) },
    };
    const msg = createMockMessage();
    (msg as { guild: unknown }).guild = guild;
    await handleLogCommand(msg, ["123456789012345678"], "m!");
  });

  it("sets log channel successfully", async () => {
    setTableResult("logChannelsTable", "findFirst", null);
    setTableResult("logChannelsTable", "findFirst", null);
    const guild = {
      channels: { fetch: mock(async () => ({ type: 0 })) },
    };
    const msg = createMockMessage();
    (msg as { guild: unknown }).guild = guild;
    await handleLogCommand(msg, ["123456789012345678"], "m!");
  });

  it("accepts mention format", async () => {
    setTableResult("logChannelsTable", "findFirst", null);
    const guild = {
      channels: { fetch: mock(async () => ({ type: 0 })) },
    };
    const msg = createMockMessage();
    (msg as { guild: unknown }).guild = guild;
    await handleLogCommand(msg, ["<#123456789012345678>"], "m!");
  });
});
