import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setQueryResult, setMutationResult, setTableResult, clear } =
  createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { enforceLinkCooldown } from "@/features/link-cooldown/handlers/enforce.handler";

describe("enforceLinkCooldown", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await enforceLinkCooldown(msg);
  });

  it("returns when no config", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", null);
    const msg = createMockMessage();
    await enforceLinkCooldown(msg);
  });

  it("returns when config disabled", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: false,
    });
    const msg = createMockMessage();
    await enforceLinkCooldown(msg);
  });

  it("returns when no URLs in message", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setTableResult("whitelistsTable", "findMany", []);
    const msg = createMockMessage({ content: "no links here" });
    await enforceLinkCooldown(msg);
  });

  it("allows when rate not exceeded", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setTableResult("linkCooldownEntriesTable", "findFirst", null);
    setTableResult("whitelistsTable", "findMany", []);
    setMutationResult("insert", undefined);
    const msg = createMockMessage({ content: "check https://example.com" });
    await enforceLinkCooldown(msg);
  });
});
