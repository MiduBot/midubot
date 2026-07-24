import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { handleLangCommand } from "@/features/language/commands/lang.command";

describe("handleLangCommand", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in a guild", async () => {
    const msg = createMockMessage({ guildId: null });
    await handleLangCommand(msg, ["en"], "m!");
  });

  it("shows usage when no args", async () => {
    const msg = createMockMessage();
    await handleLangCommand(msg, [], "m!");
  });

  it("shows usage when invalid language", async () => {
    const msg = createMockMessage();
    await handleLangCommand(msg, ["fr"], "m!");
  });

  it("sets language to en", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    const msg = createMockMessage();
    await handleLangCommand(msg, ["en"], "m!");
  });

  it("sets language to es", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    const msg = createMockMessage();
    await handleLangCommand(msg, ["es"], "m!");
  });
});
