import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { ModActionService } from "@/features/mod-actions";

describe("ModActionService", () => {
  beforeEach(() => {
    clear();
  });

  describe("logAction", () => {
    it("inserts action without throwing", async () => {
      setMutationResult("insert", undefined);
      await ModActionService.logAction("g1", "puff", "u1", "mod1", "reason", {
        deleted: 3,
      });
    });

    it("swallows insert errors", async () => {
      setMutationResult("insert", () => {
        throw new Error("db down");
      });
      await ModActionService.logAction("g1", "puff", "u1");
    });
  });

  describe("getHistory", () => {
    it("returns actions from query", async () => {
      const actions = [
        { id: 1, actionType: "puff", targetUserId: "u1", createdAt: new Date() },
        { id: 2, actionType: "report_quorum", targetUserId: "u1", createdAt: new Date() },
      ];
      setQueryResult("findMany", actions);
      const result = await ModActionService.getHistory("g1", "u1");
      expect(result).toEqual(actions);
    });

    it("returns empty array when no actions", async () => {
      setQueryResult("findMany", []);
      const result = await ModActionService.getHistory("g1", "u1");
      expect(result).toEqual([]);
    });
  });

  describe("getStats", () => {
    it("returns grouped counts", async () => {
      const stats = [
        { actionType: "puff", total: 5 },
        { actionType: "line_filter", total: 2 },
      ];
      setMutationResult("select", stats);
      const result = await ModActionService.getStats("g1", new Date());
      expect(result).toEqual(stats);
    });
  });

  describe("getTopTargets", () => {
    it("returns top users", async () => {
      const top = [{ targetUserId: "u1", total: 10 }];
      setMutationResult("select", top);
      const result = await ModActionService.getTopTargets("g1", new Date());
      expect(result).toEqual(top);
    });
  });

  describe("getTotalSince", () => {
    it("returns count", async () => {
      setMutationResult("select", [{ total: 42 }]);
      const result = await ModActionService.getTotalSince("g1", new Date());
      expect(result).toBe(42);
    });

    it("returns 0 when no rows", async () => {
      setMutationResult("select", []);
      const result = await ModActionService.getTotalSince("g1", new Date());
      expect(result).toBe(0);
    });
  });
});
