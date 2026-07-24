import { describe, it, expect, beforeEach } from "bun:test";
import { SanctionCache } from "@/features/ai-mod/services/sanction-cache.service";

beforeEach(() => SanctionCache._resetForTests());

describe("SanctionCache", () => {
  it("returns null for an unknown key", () => {
    expect(SanctionCache.get("g1", "u1")).toBeNull();
  });

  it("returns the entry within TTL", () => {
    SanctionCache.set("g1", "u1", 42, "c1");
    const v = SanctionCache.get("g1", "u1");
    expect(v).not.toBeNull();
    expect(v?.firstCaseId).toBe(42);
    expect(v?.firstChannelId).toBe("c1");
    expect(v!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns null after TTL expires and evicts the key", async () => {
    SanctionCache.set("g1", "u1", 1, "c1", 10);
    await new Promise((r) => setTimeout(r, 25));
    expect(SanctionCache.get("g1", "u1")).toBeNull();
    expect(SanctionCache.get("g1", "u1")).toBeNull();
  });

  it("isolates entries by guildId and authorId", () => {
    SanctionCache.set("g1", "u1", 1, "c1");
    SanctionCache.set("g1", "u2", 2, "c2");
    SanctionCache.set("g2", "u1", 3, "c3");
    expect(SanctionCache.get("g1", "u1")?.firstCaseId).toBe(1);
    expect(SanctionCache.get("g1", "u2")?.firstCaseId).toBe(2);
    expect(SanctionCache.get("g2", "u1")?.firstCaseId).toBe(3);
    expect(SanctionCache.get("g2", "u2")).toBeNull();
  });

  it("prune removes expired entries and keeps live ones", async () => {
    SanctionCache.set("g1", "u1", 1, "c1", 10);
    SanctionCache.set("g1", "u2", 2, "c2", 10);
    await new Promise((r) => setTimeout(r, 25));
    SanctionCache.set("g1", "u3", 3, "c3", 10_000);
    SanctionCache.prune();
    expect(SanctionCache.get("g1", "u1")).toBeNull();
    expect(SanctionCache.get("g1", "u2")).toBeNull();
    expect(SanctionCache.get("g1", "u3")?.firstCaseId).toBe(3);
  });

  it("_resetForTests clears the map", () => {
    SanctionCache.set("g1", "u1", 1, "c1");
    SanctionCache._resetForTests();
    expect(SanctionCache.get("g1", "u1")).toBeNull();
  });
});
