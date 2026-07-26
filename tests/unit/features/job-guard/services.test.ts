import { describe, it, expect, beforeEach, mock } from "bun:test";

const insertResult = { lastInsertRowid: 42 };
const findFirst = mock(async () => null);
const updateSet = mock(async () => {});
const promptsFindMany = mock(async () => [] as { prompt: string }[]);

const insertValues = mock(async () => insertResult);
const updateWhere = mock(() => updateSet());

mock.module("@/db/connection", () => ({
  db: {
    insert: () => ({ values: insertValues }),
    update: () => ({ set: () => ({ where: updateWhere }) }),
    query: {
      jobGuardCasesTable: { findFirst },
      jobGuardPromptsTable: { findMany: promptsFindMany },
    },
  },
}));

import { JobGuardCasesService } from "@/features/job-guard/services/cases.service";
import { JobGuardPromptsService } from "@/features/job-guard/services/prompts.service";

describe("JobGuardCasesService", () => {
  beforeEach(() => {
    insertValues.mockClear();
    findFirst.mockClear();
  });

  it("insert returns lastInsertRowid as number", async () => {
    const id = await JobGuardCasesService.insert({
      guildId: "g1",
      authorId: "a1",
      channelId: "c1",
      messageId: "m1",
      content: "se busca",
      verdict: "block",
      confidence: 0.9,
      reason: "oferta",
      deleted: true,
    });
    expect(id).toBe(42);
    expect(insertValues).toHaveBeenCalled();
  });

  it("get returns null when missing", async () => {
    findFirst.mockImplementation(async () => null);
    expect(await JobGuardCasesService.get(99)).toBeNull();
  });
});

describe("JobGuardPromptsService", () => {
  beforeEach(() => {
    insertValues.mockClear();
    promptsFindMany.mockClear();
  });

  it("listRecent returns prompt rows", async () => {
    promptsFindMany.mockImplementation(async () => [{ prompt: "nota" }]);
    const rows = await JobGuardPromptsService.listRecent("g1", 10);
    expect(rows).toEqual([{ prompt: "nota" }]);
  });

  it("listRecent returns [] on db error", async () => {
    promptsFindMany.mockImplementation(async () => {
      throw new Error("db");
    });
    expect(await JobGuardPromptsService.listRecent("g1", 10)).toEqual([]);
  });

  it("add truncates prompt and sets createdAt", async () => {
    const long = "x".repeat(400);
    await JobGuardPromptsService.add("g1", long);
    expect(insertValues).toHaveBeenCalledWith({
      guildId: "g1",
      prompt: "x".repeat(300),
      createdAt: expect.any(Date),
    });
  });
});
