import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, setQueryResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { ModRoleService } from "@/features/ai-mod/services/mod-role.service";

beforeEach(() => clear());

describe("ModRoleService", () => {
  it("list returns rows", async () => {
    setQueryResult("findMany", [{ id: 1, guildId: "g1", roleId: "r1" }]);
    expect(await ModRoleService.list("g1")).toHaveLength(1);
  });
  it("add throws when present", async () => {
    setQueryResult("findFirst", { id: 1, guildId: "g1", roleId: "r1" });
    await expect(ModRoleService.add("g1", "r1")).rejects.toThrow();
  });
  it("add inserts when absent", async () => {
    setQueryResult("findFirst", undefined);
    await ModRoleService.add("g1", "r1");
  });
  it("hasRole true when findFirst returns a row", async () => {
    setQueryResult("findFirst", { id: 1, guildId: "g1", roleId: "r1" });
    expect(await ModRoleService.hasRole("g1", "r1")).toBe(true);
  });
  it("hasRole false otherwise", async () => {
    setQueryResult("findFirst", undefined);
    expect(await ModRoleService.hasRole("g1", "r1")).toBe(false);
  });
  it("remove does not throw", async () => {
    await ModRoleService.remove("g1", "r1");
  });
});
