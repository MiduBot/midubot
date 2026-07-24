import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { applyLineFilter } from "@/features/line-filter/handlers/apply.handler";

describe("applyLineFilter", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in a guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await applyLineFilter(msg, {} as never);
  });

  it("returns when author is a bot", async () => {
    const msg = createMockMessage({ author: { bot: true } });
    await applyLineFilter(msg, {} as never);
  });

  it("returns when filter disabled", async () => {
    setTableResult("guildConfigsTable", "findFirst", {
      lineFilterEnabled: false,
    });
    const msg = createMockMessage();
    await applyLineFilter(msg, {} as never);
  });

  it("returns when channel is exempt", async () => {
    setTableResult("guildConfigsTable", "findFirst", {
      lineFilterEnabled: true,
      lineFilterExemptChannels: JSON.stringify(["222222222222222222"]),
    });
    const msg = createMockMessage();
    await applyLineFilter(msg, {} as never);
  });

  it("returns when below threshold", async () => {
    setTableResult("guildConfigsTable", "findFirst", {
      lineFilterEnabled: true,
      lineFilterExemptChannels: "[]",
    });
    const msg = createMockMessage({ content: "short" });
    await applyLineFilter(msg, {} as never);
  });
});
