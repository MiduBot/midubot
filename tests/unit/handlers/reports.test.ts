import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, clear } = createMockDb();

const fingerprint = {
  dhash: "10101010",
  phash: "01010101",
  ahash: "11110000",
  colorSig: "ff00aa",
  width: 100,
  height: 100,
};

const mockHash = {
  downloadFingerprint: mock(async (_url: string) => fingerprint),
  compareFingerprints: mock(() => ({
    isSimilar: true,
    confidence: 95,
    details: {
      dhashDist: 2,
      phashDist: 1,
      ahashDist: 1,
      colorDist: 5,
      aspectDiff: 0,
      votes: 3,
      mode: "ensemble" as const,
    },
  })),
};

mock.module("@/db/connection", () => ({ db }));
mock.module("@/features/images/services/hash.service", () => ({
  ImageHashService: mockHash,
}));

import { handleReportQuorum } from "@/features/reports/handlers/quorum.handler";
import { handleReportMessageDelete } from "@/features/reports/handlers/delete-cleanup.handler";

describe("handleReportMessageDelete", () => {
  it("returns when no id", () => {
    handleReportMessageDelete({ id: null } as never);
  });

  it("returns when no entry", () => {
    handleReportMessageDelete({ id: "missing" } as never);
  });
});

describe("handleReportQuorum", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("processes a text report", async () => {
    setTableResult("logChannelsTable", "findFirst", null);
    setTableResult("whitelistsTable", "findMany", []);

    const collection = { filter: () => ({ values: () => [] }) };
    const guild = {
      id: "g1",
      channels: { fetch: mock(async () => collection) },
    };
    const original = createMockMessage({ content: "spam text" });
    await handleReportQuorum(original, guild as never);
  });

  it("processes a report without signature", async () => {
    setTableResult("logChannelsTable", "findFirst", null);
    setTableResult("whitelistsTable", "findMany", []);
    const collection = { filter: () => ({ values: () => [] }) };
    const guild = {
      id: "g1",
      channels: { fetch: mock(async () => collection) },
    };
    const original = createMockMessage({ content: "" });
    await handleReportQuorum(original, guild as never);
  });
});
