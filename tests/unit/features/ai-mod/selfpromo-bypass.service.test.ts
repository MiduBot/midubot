import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, setQueryResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { SelfpromoBypassService } from "@/features/ai-mod/services/selfpromo-bypass.service";

beforeEach(() => clear());

describe("SelfpromoBypassService", () => {
  it("list returns rows", async () => {
    setQueryResult("findMany", [{ id: 1, guildId: "g1", channelId: "c1" }]);
    expect(await SelfpromoBypassService.list("g1")).toHaveLength(1);
  });
  it("isBypass true when findFirst returns a row", async () => {
    setQueryResult("findFirst", { id: 1, guildId: "g1", channelId: "c1" });
    expect(await SelfpromoBypassService.isBypass("g1", "c1")).toBe(true);
  });
  it("isBypass false otherwise", async () => {
    setQueryResult("findFirst", undefined);
    expect(await SelfpromoBypassService.isBypass("g1", "c1")).toBe(false);
  });
  it("add throws when present", async () => {
    setQueryResult("findFirst", { id: 1, guildId: "g1", channelId: "c1" });
    await expect(SelfpromoBypassService.add("g1", "c1")).rejects.toThrow();
  });
  it("add inserts when absent", async () => {
    setQueryResult("findFirst", undefined);
    await SelfpromoBypassService.add("g1", "c1");
  });
  it("remove does not throw", async () => {
    await SelfpromoBypassService.remove("g1", "c1");
  });
});
