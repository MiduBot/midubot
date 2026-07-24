import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { CasesService } from "@/features/ai-mod/services/cases.service";

beforeEach(() => clear());

describe("CasesService", () => {
  it("get returns the row when present", async () => {
    setQueryResult("findFirst", { id: 7, guildId: "g1", content: "x", resolved: false });
    const row = await CasesService.get(7);
    expect(row?.id).toBe(7);
  });
  it("get returns null when absent", async () => {
    setQueryResult("findFirst", undefined);
    expect(await CasesService.get(7)).toBeNull();
  });
  it("insert returns the new id from result.lastInsertRowid (libsql shape)", async () => {
    setMutationResult("insert", { lastInsertRowid: 42n } as never);
    const id = await CasesService.insert({
      guildId: "g1", authorId: "u1", channelId: "c1", messageId: "m1",
      content: "x", verdict: 1, confidence: 0.9, platform: 0, reason: "r",
      actionTaken: "timeout",
    });
    expect(id).toBe(42);
  });
  it("insert returns 0 when lastInsertRowid is missing", async () => {
    setMutationResult("insert", {} as never);
    const id = await CasesService.insert({
      guildId: "g1", authorId: "u1", channelId: "c1", messageId: "m1",
      content: "x", verdict: 1, confidence: 0.9, platform: 0, reason: "r",
      actionTaken: "timeout",
    });
    expect(id).toBe(0);
  });
  it("markResolved does not throw", async () => {
    await CasesService.markResolved(7, "mod1", "correct");
  });
  it("markFeedbackPending does not throw", async () => {
    await CasesService.markFeedbackPending(7, "mod1", "incorrect", "AI unavailable");
  });
  it("list returns rows from select chain", async () => {
    setMutationResult("select", [
      { id: 1, guildId: "g1", content: "a", resolved: false, promptPending: true },
    ]);
    const rows = await CasesService.list("g1", "pending", 10, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });
  it("count returns numeric total", async () => {
    setMutationResult("select", [{ value: 3 }]);
    expect(await CasesService.count("g1", "all")).toBe(3);
  });
});
