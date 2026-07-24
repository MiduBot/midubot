import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { handleLineFilterCommand } from "@/features/line-filter/commands/line-filter.command";

describe("handleLineFilterCommand", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await handleLineFilterCommand(msg, ["on"], "m!");
  });

  it("shows usage when no args", async () => {
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, [], "m!");
  });

  it("shows usage for unknown subcommand", async () => {
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["foo"], "m!");
  });

  it("on enables filter", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["on"], "m!");
  });

  it("off disables filter", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["off"], "m!");
  });

  it("threshold requires value", async () => {
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["threshold"], "m!");
  });

  it("threshold rejects out of range", async () => {
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["threshold", "1"], "m!");
    await handleLineFilterCommand(msg, ["threshold", "999"], "m!");
  });

  it("threshold accepts valid value", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["threshold", "50"], "m!");
  });

  it("risk requires value", async () => {
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["risk"], "m!");
  });

  it("risk rejects out of range", async () => {
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["risk", "0"], "m!");
    await handleLineFilterCommand(msg, ["risk", "11"], "m!");
  });

  it("risk accepts valid value", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["risk", "5"], "m!");
  });

  it("exempt list shows empty", async () => {
    setTableResult("guildConfigsTable", "findFirst", {
      lineFilterExemptChannels: "[]",
    });
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["exempt", "list"], "m!");
  });

  it("exempt list shows entries", async () => {
    setTableResult("guildConfigsTable", "findFirst", {
      lineFilterExemptChannels: '["123456789012345678"]',
    });
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["exempt", "list"], "m!");
  });

  it("exempt add requires channel", async () => {
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["exempt", "add"], "m!");
  });

  it("exempt add unknown channel", async () => {
    const msg = createMockMessage();
    (msg.guild as unknown as { channels: { cache: { get: (id: string) => unknown } } }).channels = {
      cache: { get: () => null },
    };
    await handleLineFilterCommand(msg, ["exempt", "add", "123456789012345678"], "m!");
  });

  it("exempt add valid channel", async () => {
    setTableResult("guildConfigsTable", "findFirst", {
      lineFilterExemptChannels: "[]",
    });
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    (msg.guild as unknown as { channels: { cache: { get: (id: string) => unknown } } }).channels = {
      cache: { get: () => ({}) },
    };
    await handleLineFilterCommand(msg, ["exempt", "add", "123456789012345678"], "m!");
  });

  it("exempt remove valid channel", async () => {
    setTableResult("guildConfigsTable", "findFirst", {
      lineFilterExemptChannels: '["123456789012345678"]',
    });
    setMutationResult("insert", undefined);
    const msg = createMockMessage();
    (msg.guild as unknown as { channels: { cache: { get: (id: string) => unknown } } }).channels = {
      cache: { get: () => ({}) },
    };
    await handleLineFilterCommand(msg, ["exempt", "remove", "123456789012345678"], "m!");
  });

  it("status shows config", async () => {
    setTableResult("guildConfigsTable", "findFirst", {
      lineFilterEnabled: true,
      lineFilterThreshold: 25,
      lineFilterRiskLimit: 3,
      lineFilterExemptChannels: "[]",
    });
    const msg = createMockMessage();
    await handleLineFilterCommand(msg, ["status"], "m!");
  });
});
