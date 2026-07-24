import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, setQueryResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { ContextBuilderService } from "@/features/ai-mod/services/context-builder.service";

beforeEach(() => {
  clear();
});

describe("ContextBuilderService.buildContext", () => {
  it("returns empty strings when DB is empty", async () => {
    setQueryResult("findMany", []);
    const ctx = await ContextBuilderService.buildContext("g1");
    expect(ctx.examples).toBe("");
    expect(ctx.prompts).toBe("");
  });

  it("formats malicious=true and malicious=false examples", async () => {
    setQueryResult("findMany", [
      { id: 1, guildId: "g1", content: "send me a DM", malicious: true },
      { id: 2, guildId: "g1", content: "soy dev senior", malicious: false },
    ]);
    const ctx = await ContextBuilderService.buildContext("g1");
    expect(ctx.examples).toContain("send me a DM");
    expect(ctx.examples).toContain("soy dev senior");
    expect(ctx.examples.toLowerCase()).toContain("malicious");
  });

  it("truncates example content to 200 chars", async () => {
    const long = "x".repeat(500);
    setQueryResult("findMany", [
      { id: 1, guildId: "g1", content: long, malicious: true },
    ]);
    const ctx = await ContextBuilderService.buildContext("g1");
    expect(ctx.examples.includes(long)).toBe(false);
    expect(ctx.examples.includes("x".repeat(200))).toBe(true);
  });
});
