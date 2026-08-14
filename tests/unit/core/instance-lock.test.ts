import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createMockDb } from "../../mocks/db";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import {
  claimInstance,
  createInstanceId,
  isCurrentInstance,
  watchInstance,
} from "@/core/instance-lock";

describe("instance-lock", () => {
  beforeEach(() => {
    clear();
  });

  it("creates a unique instance id", () => {
    expect(createInstanceId()).not.toBe(createInstanceId());
  });

  it("claimInstance upserts the lock row", async () => {
    setMutationResult("insert", undefined);
    await claimInstance("inst-1");
  });

  it("isCurrentInstance is true when we own the lock", async () => {
    setQueryResult("findFirst", { instanceId: "mine" });
    expect(await isCurrentInstance("mine")).toBe(true);
  });

  it("isCurrentInstance is false when another instance claimed", async () => {
    setQueryResult("findFirst", { instanceId: "other" });
    expect(await isCurrentInstance("mine")).toBe(false);
  });

  it("isCurrentInstance is false when no lock row exists", async () => {
    setQueryResult("findFirst", null);
    expect(await isCurrentInstance("mine")).toBe(false);
  });

  it("watchInstance calls onLost when the lock is stolen", async () => {
    setQueryResult("findFirst", { instanceId: "other" });
    const lost = Promise.withResolvers<void>();
    const stop = watchInstance("mine", () => lost.resolve(), 10);
    await lost.promise;
    stop();
  });

  it("watchInstance does not call onLost while we own the lock", async () => {
    setQueryResult("findFirst", { instanceId: "mine" });
    let called = false;
    const stop = watchInstance("mine", () => {
      called = true;
    }, 10);
    await Bun.sleep(35);
    stop();
    expect(called).toBe(false);
  });
});
