import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { AiModConfigService } from "@/features/ai-mod/services/ai-mod-config.service";

beforeEach(() => clear());

describe("AiModConfigService", () => {
  it("isEnabled returns false when no guild config row", async () => {
    setQueryResult("findFirst", undefined);
    expect(await AiModConfigService.isEnabled("g1")).toBe(false);
  });
  it("isEnabled returns the stored value", async () => {
    setQueryResult("findFirst", { guildId: "g1", aiModEnabled: true });
    expect(await AiModConfigService.isEnabled("g1")).toBe(true);
  });
  it("setEnabled inserts a new row when none exists", async () => {
    setQueryResult("findFirst", undefined);
    await AiModConfigService.setEnabled("g1", true);
  });
  it("setEnabled updates an existing row", async () => {
    setQueryResult("findFirst", { guildId: "g1", aiModEnabled: false });
    setMutationResult("update", undefined);
    await AiModConfigService.setEnabled("g1", true);
  });
});
