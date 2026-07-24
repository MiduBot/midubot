import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setQueryResult, setMutationResult, setTableResult, clear } =
  createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { LinkCooldownService } from "@/features/link-cooldown";

describe("LinkCooldownService.checkAndRecord", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("allows when no URLs", async () => {
    const r = await LinkCooldownService.checkAndRecord(
      "g1",
      "c1",
      "u1",
      [],
      "m1",
    );
    expect(r.allowed).toBe(true);
  });

  it("allows when no config", async () => {
    setQueryResult("findFirst", null);
    const r = await LinkCooldownService.checkAndRecord(
      "g1",
      "c1",
      "u1",
      ["https://x.com"],
      "m1",
    );
    expect(r.allowed).toBe(true);
  });

  it("allows when config disabled", async () => {
    setQueryResult("findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: false,
    });
    const r = await LinkCooldownService.checkAndRecord(
      "g1",
      "c1",
      "u1",
      ["https://x.com"],
      "m1",
    );
    expect(r.allowed).toBe(true);
  });

  it("blocks same-duplicate in same mode", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "same",
      maxLinks: 1,
      windowMs: 60000,
      enabled: true,
    });
    const dup = {
      id: 1,
      userId: "u1",
      urlHash:
        "1111111111111111111111111111111111111111111111111111111111111111",
      createdAt: new Date(),
    };
    setTableResult("linkCooldownEntriesTable", "findFirst", dup);
    setMutationResult("insert", undefined);
    const r = await LinkCooldownService.checkAndRecord(
      "g1",
      "c1",
      "u1",
      ["https://x.com"],
      "m1",
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("same_duplicate");
    expect(typeof r.retryAfterMs).toBe("number");
  });

  it("allows and inserts when no duplicate in same mode", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "same",
      maxLinks: 1,
      windowMs: 60000,
      enabled: true,
    });
    setTableResult("linkCooldownEntriesTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const r = await LinkCooldownService.checkAndRecord(
      "g1",
      "c1",
      "u1",
      ["https://x.com"],
      "m1",
    );
    expect(r.allowed).toBe(true);
  });

  it("blocks rate_limit in any mode when used >= max", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "any",
      maxLinks: 1,
      windowMs: 60000,
      enabled: true,
    });
    setMutationResult("select", [{ n: 1 }]);
    setTableResult("linkCooldownEntriesTable", "findFirst", {
      createdAt: new Date(),
    });
    const r = await LinkCooldownService.checkAndRecord(
      "g1",
      "c1",
      "u1",
      ["https://x.com"],
      "m1",
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("rate_limit");
  });

  it("allows and inserts when under max in any mode", async () => {
    setTableResult("linkCooldownChannelsTable", "findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "any",
      maxLinks: 3,
      windowMs: 60000,
      enabled: true,
    });
    setMutationResult("select", [{ n: 1 }]);
    setMutationResult("insert", undefined);
    const r = await LinkCooldownService.checkAndRecord(
      "g1",
      "c1",
      "u1",
      ["https://x.com"],
      "m1",
    );
    expect(r.allowed).toBe(true);
  });
});

describe("LinkCooldownService channel CRUD", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("getChannelConfig returns null when not found", async () => {
    setQueryResult("findFirst", null);
    expect(
      await LinkCooldownService.getChannelConfig("g1", "c1"),
    ).toBeNull();
  });

  it("getChannelConfig returns parsed config", async () => {
    setQueryResult("findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "any",
      maxLinks: 5,
      windowMs: 10000,
      enabled: true,
    });
    const cfg = await LinkCooldownService.getChannelConfig("g1", "c1");
    expect(cfg?.mode).toBe("any");
    expect(cfg?.maxLinks).toBe(5);
  });

  it("addChannel inserts and returns config", async () => {
    setQueryResult("findFirst", null);
    setMutationResult("insert", undefined);
    const cfg = await LinkCooldownService.addChannel("g1", "c1", {
      mode: "any",
      maxLinks: 2,
      windowMs: 5000,
    });
    expect(cfg.mode).toBe("any");
    expect(cfg.enabled).toBe(true);
  });

  it("removeChannel returns false when not found", async () => {
    setQueryResult("findFirst", null);
    const r = await LinkCooldownService.removeChannel("g1", "c1");
    expect(r).toBe(false);
  });

  it("removeChannel deletes and returns true", async () => {
    setQueryResult("findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setMutationResult("delete", { rowsAffected: 1 });
    const r = await LinkCooldownService.removeChannel("g1", "c1");
    expect(r).toBe(true);
  });

  it("listChannels returns parsed array", async () => {
    setQueryResult("findMany", [
      {
        guildId: "g1",
        channelId: "c1",
        mode: "any",
        maxLinks: 5,
        windowMs: 1000,
        enabled: true,
      },
    ]);
    const list = await LinkCooldownService.listChannels("g1");
    expect(list).toHaveLength(1);
  });

  it("setMode/setMax/setWindow/setEnabled throw when not configured", async () => {
    setQueryResult("findFirst", null);
    await expect(
      LinkCooldownService.setMode("g1", "c1", "any"),
    ).rejects.toThrow("channel_not_configured");
    await expect(
      LinkCooldownService.setMax("g1", "c1", 5),
    ).rejects.toThrow("channel_not_configured");
    await expect(
      LinkCooldownService.setWindow("g1", "c1", 1000),
    ).rejects.toThrow("channel_not_configured");
    await expect(
      LinkCooldownService.setEnabled("g1", "c1", true),
    ).rejects.toThrow("channel_not_configured");
  });

  it("setMode/setMax/setWindow/setEnabled update when configured", async () => {
    setQueryResult("findFirst", {
      guildId: "g1",
      channelId: "c1",
      mode: "same",
      maxLinks: 1,
      windowMs: 1000,
      enabled: true,
    });
    setMutationResult("update", undefined);
    await LinkCooldownService.setMode("g1", "c1", "any");
    await LinkCooldownService.setMax("g1", "c1", 5);
    await LinkCooldownService.setWindow("g1", "c1", 5000);
    await LinkCooldownService.setEnabled("g1", "c1", false);
  });

  it("resetUser returns rowsAffected", async () => {
    setMutationResult("delete", { rowsAffected: 3 });
    const r = await LinkCooldownService.resetUser("g1", "c1", "u1");
    expect(r).toBe(3);
  });

  it("getRecentEntries returns mapped rows", async () => {
    setMutationResult("select", [
      { userId: "u1", url: "https://x.com", createdAt: new Date() },
    ]);
    const r = await LinkCooldownService.getRecentEntries("g1", "c1");
    expect(r).toHaveLength(1);
  });
});
