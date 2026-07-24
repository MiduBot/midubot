import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import {
  LinkNewcomerService,
  DEFAULT_LINK_NEWCOMER_THRESHOLD_MS,
} from "@/features/link-newcomer";

beforeEach(() => {
  clear();
  appCache.clear();
});

describe("LinkNewcomerService", () => {
  it("getConfig returns defaults when no row", async () => {
    setQueryResult("findFirst", undefined);
    const cfg = await LinkNewcomerService.getConfig("g1");
    expect(cfg.enabled).toBe(false);
    expect(cfg.thresholdMs).toBe(DEFAULT_LINK_NEWCOMER_THRESHOLD_MS);
  });

  it("getConfig returns stored values", async () => {
    setQueryResult("findFirst", {
      guildId: "g1",
      linkNewcomerEnabled: true,
      linkNewcomerThresholdMs: 86400000,
    });
    const cfg = await LinkNewcomerService.getConfig("g1");
    expect(cfg.enabled).toBe(true);
    expect(cfg.thresholdMs).toBe(86400000);
  });

  it("setEnabled inserts a row", async () => {
    setMutationResult("insert", undefined);
    await LinkNewcomerService.setEnabled("g1", true);
  });

  it("setThresholdMs inserts a row", async () => {
    setMutationResult("insert", undefined);
    await LinkNewcomerService.setThresholdMs("g1", 172800000);
  });

  it("isNewMember returns true when join age is below threshold", () => {
    const now = Date.now();
    expect(
      LinkNewcomerService.isNewMember(now - 86400000, 172800000, now),
    ).toBe(true);
  });

  it("isNewMember returns false when join age is above threshold", () => {
    const now = Date.now();
    expect(
      LinkNewcomerService.isNewMember(now - 86400000 * 10, 86400000, now),
    ).toBe(false);
  });
});
