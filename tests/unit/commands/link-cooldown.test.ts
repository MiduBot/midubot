import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { handleLinkCooldownCommand } from "@/features/link-cooldown/commands/link-cooldown.command";

function makeMsgWithChannels() {
  const msg = createMockMessage();
  (msg.guild as unknown as { channels: { cache: { get: (id: string) => unknown } } }).channels = {
    cache: {
      get: (id: string) => (id === "123456789012345678" ? { type: 0 } : null),
    },
  };
  return msg;
}

describe("handleLinkCooldownCommand", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await handleLinkCooldownCommand(msg, ["add", "123456789012345678"], "m!");
  });

  it("shows usage when no args", async () => {
    const msg = createMockMessage();
    await handleLinkCooldownCommand(msg, [], "m!");
  });

  it("shows usage for unknown subcommand", async () => {
    const msg = createMockMessage();
    await handleLinkCooldownCommand(msg, ["unknown"], "m!");
  });

  it("add requires channel", async () => {
    const msg = createMockMessage();
    await handleLinkCooldownCommand(msg, ["add"], "m!");
  });

  it("add invalid channel", async () => {
    const msg = createMockMessage();
    (msg.guild as unknown as { channels: { cache: { get: (id: string) => unknown } } }).channels = {
      cache: { get: () => null },
    };
    await handleLinkCooldownCommand(msg, ["add", "bad"], "m!");
  });

  it("add invalid mode", async () => {
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["add", "123456789012345678", "invalid"], "m!");
  });

  it("add invalid max", async () => {
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["add", "123456789012345678", "same", "999"], "m!");
  });

  it("add invalid window", async () => {
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["add", "123456789012345678", "same", "1", "1ms"], "m!");
  });

  it("add success", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["add", "123456789012345678"], "m!");
  });

  it("remove not configured", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", null);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["remove", "123456789012345678"], "m!");
  });

  it("remove success", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "123456789012345678",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setMutationResult("delete", { rowsAffected: 1 });
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["remove", "123456789012345678"], "m!");
  });

  it("list empty", async () => {
    setTableResult("linkCooldownChannelsTable", "findMany", []);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["list"], "m!");
  });

  it("list with entries", async () => {
    setTableResult("linkCooldownChannelsTable", "findMany", [
      {
        guildId: "g1",
        channelId: "123456789012345678",
        mode: "same",
        maxLinks: 1,
        windowMs: 1000,
        enabled: true,
      },
    ]);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["list"], "m!");
  });

  it("mode requires args", async () => {
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["mode"], "m!");
  });

  it("mode not configured", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", null);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["mode", "123456789012345678", "any"], "m!");
  });

  it("mode success", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "123456789012345678",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setMutationResult("update", undefined);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["mode", "123456789012345678", "any"], "m!");
  });

  it("max requires args", async () => {
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["max"], "m!");
  });

  it("max invalid", async () => {
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["max", "123456789012345678", "999"], "m!");
  });

  it("max success", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "123456789012345678",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setMutationResult("update", undefined);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["max", "123456789012345678", "5"], "m!");
  });

  it("window requires args", async () => {
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["window"], "m!");
  });

  it("window invalid", async () => {
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["window", "123456789012345678", "1ms"], "m!");
  });

  it("window success", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "123456789012345678",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setMutationResult("update", undefined);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["window", "123456789012345678", "1h"], "m!");
  });

  it("enable success", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "123456789012345678",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: false,
    });
    setMutationResult("update", undefined);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["enable", "123456789012345678"], "m!");
  });

  it("disable success", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "123456789012345678",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setMutationResult("update", undefined);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["disable", "123456789012345678"], "m!");
  });

  it("status not configured", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", null);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["status", "123456789012345678"], "m!");
  });

  it("status success", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "123456789012345678",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setMutationResult("select", [
      { userId: "u1", url: "https://x.com", createdAt: new Date() },
    ]);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["status", "123456789012345678"], "m!");
  });

  it("status empty entries", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "123456789012345678",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setMutationResult("select", []);
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["status", "123456789012345678"], "m!");
  });

  it("reset requires args", async () => {
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["reset"], "m!");
  });

  it("reset user not found", async () => {
    const msg = makeMsgWithChannels();
    (msg.guild as unknown as { members: { cache: Map<string, unknown> } }).members = {
      cache: new Map(),
    };
    await handleLinkCooldownCommand(msg, ["reset", "123456789012345678", "unknownuser"], "m!");
  });

  it("reset success", async () => {
    setMutationResult("delete", { rowsAffected: 2 });
    const msg = makeMsgWithChannels();
    await handleLinkCooldownCommand(msg, ["reset", "123456789012345678", "u1"], "m!");
  });
});
