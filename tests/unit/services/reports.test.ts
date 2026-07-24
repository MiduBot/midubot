import { describe, it, expect } from "bun:test";
import {
  addReport,
  getReport,
  removeReport,
  markQuorumProcessed,
  cleanupExpired,
} from "@/features/reports/services/report.service";
import { createMockMessage } from "../../mocks/discord";

describe("ReportService", () => {
  describe("addReport", () => {
    it("rejects self-report", () => {
      const msg = createMockMessage({ author: { id: "u1" } });
      const r = addReport("m1", "u1", msg);
      expect(r).toEqual({ kind: "self_report" });
    });

    it("returns already_processed when already in processed set", () => {
      const msg = createMockMessage({ author: { id: "u1" } });
      addReport("mx", "u2", msg);
      markQuorumProcessed("mx");
      const r = addReport("mx", "u3", msg);
      expect(r).toEqual({ kind: "already_processed" });
    });

    it("returns already_reported when same reporter", () => {
      const msg = createMockMessage({ author: { id: "u1" } });
      addReport("mr", "u2", msg);
      const r = addReport("mr", "u2", msg);
      expect(r).toEqual({ kind: "already_reported" });
    });

    it("returns added with count=1 and isQuorum=false on first report", () => {
      const msg = createMockMessage({ author: { id: "u1" } });
      const r = addReport("m3", "u2", msg);
      expect(r).toEqual({ kind: "added", count: 1, isQuorum: false });
    });

    it("reaches quorum at 3 distinct reporters", () => {
      const msg = createMockMessage({ author: { id: "u1" } });
      const r1 = addReport("mq", "u2", msg);
      const r2 = addReport("mq", "u3", msg);
      const r3 = addReport("mq", "u4", msg);
      expect(r1).toMatchObject({ kind: "added", count: 1 });
      expect(r2).toMatchObject({ kind: "added", count: 2 });
      expect(r3).toMatchObject({ kind: "added", count: 3, isQuorum: true });
    });
  });

  describe("getReport/removeReport", () => {
    it("retrieves and removes entries", () => {
      const msg = createMockMessage({ author: { id: "u1" } });
      addReport("mz", "u2", msg);
      const e = getReport("mz");
      expect(e?.reporterIds.has("u2")).toBe(true);
      removeReport("mz");
      expect(getReport("mz")).toBeUndefined();
    });
  });

  describe("markQuorumProcessed", () => {
    it("is idempotent", () => {
      markQuorumProcessed("id1");
      markQuorumProcessed("id1");
      const msg = createMockMessage({ author: { id: "u1" } });
      expect(addReport("id1", "u5", msg)).toEqual({
        kind: "already_processed",
      });
    });
  });

  describe("cleanupExpired", () => {
    it("removes entries with expired TTL", () => {
      const msg = createMockMessage({ author: { id: "u1" } });
      addReport("cl1", "u2", msg);
      const e = getReport("cl1");
      expect(e).toBeDefined();
      if (e) e.expiresAt = Date.now() - 1000;
      cleanupExpired();
      expect(getReport("cl1")).toBeUndefined();
    });

    it("keeps entries within TTL", () => {
      const msg = createMockMessage({ author: { id: "u1" } });
      addReport("cl2", "u2", msg);
      cleanupExpired();
      expect(getReport("cl2")).toBeDefined();
    });

    it("cleans up processedQuorumIds for expired reports", () => {
      const msg = createMockMessage({ author: { id: "u1" } });
      addReport("cl3", "u2", msg);
      markQuorumProcessed("cl3");
      const e = getReport("cl3");
      if (e) e.expiresAt = Date.now() - 1000;
      cleanupExpired();
      const msg2 = createMockMessage({ author: { id: "u1" } });
      expect(addReport("cl3", "u9", msg2)).toMatchObject({
        kind: "added",
      });
    });
  });
});
