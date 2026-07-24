import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, setQueryResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { NotifyTargetsService } from "@/features/ai-mod/services/notify-targets.service";

beforeEach(() => clear());

describe("NotifyTargetsService", () => {
  it("list returns rows with targetType", async () => {
    setQueryResult("findMany", [
      { id: 1, guildId: "g1", targetId: "u1", targetType: "user" },
      { id: 2, guildId: "g1", targetId: "r1", targetType: "role" },
    ]);
    const rows = await NotifyTargetsService.list("g1");
    expect(rows).toHaveLength(2);
    expect(rows[0].targetType).toBe("user");
  });
  it("add throws when present", async () => {
    setQueryResult("findFirst", { id: 1, guildId: "g1", targetId: "u1", targetType: "user" });
    await expect(NotifyTargetsService.add("g1", "u1", "user")).rejects.toThrow();
  });
  it("add inserts when absent", async () => {
    setQueryResult("findFirst", undefined);
    await NotifyTargetsService.add("g1", "u1", "user");
  });
  it("remove does not throw", async () => {
    await NotifyTargetsService.remove("g1", "u1");
  });
});
