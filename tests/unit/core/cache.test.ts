import { describe, it, expect, beforeEach } from "bun:test";
import { Cache } from "@/core/cache";

describe("Cache", () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache();
  });

  it("returns null for missing keys", () => {
    expect(cache.get("missing")).toBeNull();
  });

  it("stores and retrieves values", () => {
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
  });

  it("expires entries after TTL", async () => {
    cache.set("k", "v", 5);
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.get("k")).toBeNull();
  });

  it("deletes entries by key", () => {
    cache.set("k", "v");
    cache.delete("k");
    expect(cache.get("k")).toBeNull();
  });

  it("deletes entries by prefix", () => {
    cache.set("a:1", 1);
    cache.set("a:2", 2);
    cache.set("b:1", 3);
    cache.deleteByPrefix("a:");
    expect(cache.get("a:1")).toBeNull();
    expect(cache.get("a:2")).toBeNull();
    expect(cache.get("b:1")).toBe(3);
  });

  it("clears all entries", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBeNull();
  });

  it("returns keys and size", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.keys().sort()).toEqual(["a", "b"]);
    expect(cache.size()).toBe(2);
  });

  it("uses a default TTL when not provided", async () => {
    const short = new Cache(5);
    short.set("k", "v");
    await new Promise((r) => setTimeout(r, 10));
    expect(short.get("k")).toBeNull();
  });

  it("overrides TTL per call", () => {
    cache.set("k", "v", 60_000);
    expect(cache.get("k")).toBe("v");
  });
});
