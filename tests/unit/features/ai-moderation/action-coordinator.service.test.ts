import { beforeEach, describe, expect, it, mock } from "bun:test";

type ActionRow = {
  idempotencyKey: string;
  status: "pending" | "succeeded" | "failed";
  error: string | null;
};

const rows = new Map<string, ActionRow>();
const insertedValues: Record<string, unknown>[] = [];
const updatedValues: Record<string, unknown>[] = [];
let nextId = 1;

const db = {
  insert: () => ({
    values: async (values: Record<string, unknown>) => {
      const key = values.idempotencyKey as string;
      if (rows.has(key)) throw new Error("UNIQUE constraint failed");
      insertedValues.push(values);
      rows.set(key, {
        idempotencyKey: key,
        status: values.status as ActionRow["status"],
        error: (values.error as string | null) ?? null,
      });
      return { lastInsertRowid: nextId++ };
    },
  }),
  query: {
    moderationActionsTable: {
      findFirst: async ({ where: _where }: { where: unknown }) => {
        return [...rows.values()][0] ?? null;
      },
    },
  },
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        updatedValues.push(values);
        const row = [...rows.values()][0];
        if (row) {
          row.status = values.status as ActionRow["status"];
          row.error = (values.error as string | null) ?? null;
        }
      },
    }),
  }),
};

mock.module("@/db/connection", () => ({ db }));

import { ModerationActionCoordinator } from "@/features/ai-moderation/services/action-coordinator.service";

beforeEach(() => {
  rows.clear();
  insertedValues.length = 0;
  updatedValues.length = 0;
  nextId = 1;
});

describe("ModerationActionCoordinator", () => {
  it("executes duplicate delete requests only once", async () => {
    const effect = mock(async () => true);
    const input = { runId: 1, targetId: 2, guildId: "g1", messageId: "m1" };

    const first = await ModerationActionCoordinator.delete(input, effect);
    const second = await ModerationActionCoordinator.delete(input, effect);

    expect(first).toEqual({ executed: true, status: "succeeded", error: null });
    expect(second).toEqual({ executed: false, status: "succeeded", error: null });
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it("uses UTC hour bucket in timeout key", async () => {
    await ModerationActionCoordinator.timeout(
      {
        runId: 1,
        targetId: 2,
        guildId: "g1",
        authorId: "u1",
        durationMs: 3_600_000,
        now: new Date("2026-08-23T14:59:12.000Z"),
      },
      async () => true,
    );

    expect(insertedValues[0].idempotencyKey).toBe(
      "timeout:g1:u1:3600000:2026-08-23T14",
    );
  });

  it.each([
    ["pending", null],
    ["succeeded", null],
    ["failed", "already failed"],
  ] as const)("returns existing %s without retrying effect", async (status, error) => {
    rows.set("delete:g1:m1", {
      idempotencyKey: "delete:g1:m1",
      status,
      error,
    });
    const effect = mock(async () => true);

    const result = await ModerationActionCoordinator.delete(
      { runId: 1, targetId: 2, guildId: "g1", messageId: "m1" },
      effect,
    );

    expect(result).toEqual({ executed: false, status, error });
    expect(effect).not.toHaveBeenCalled();
  });

  it("stores failed status and error when effect fails", async () => {
    const result = await ModerationActionCoordinator.delete(
      { runId: 1, targetId: 2, guildId: "g1", messageId: "m1" },
      async () => {
        throw new Error("Discord unavailable");
      },
    );

    expect(result).toEqual({ executed: true, status: "failed", error: "Discord unavailable" });
    expect(updatedValues).toContainEqual({ status: "failed", error: "Discord unavailable" });
  });
});
