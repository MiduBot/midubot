import { beforeEach, describe, expect, it, mock } from "bun:test";

const insertedValues: Record<string, unknown>[] = [];
const updatedValues: Record<string, unknown>[] = [];
const operations: string[] = [];
let insertError: Error | null = null;
let contextRows: Record<string, unknown>[] = [];
let legacyQueried = false;

const db = {
  transaction: async <T>(callback: (tx: typeof db) => Promise<T>): Promise<T> => callback(db),
  insert: () => ({
    values: async (values: Record<string, unknown>) => {
      operations.push("insert");
      if (insertError) throw insertError;
      insertedValues.push(values);
      return { lastInsertRowid: 1 };
    },
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => {
      updatedValues.push(values);
      return {
        where: async () => {
          operations.push("update");
        },
      };
    },
  }),
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => contextRows,
          }),
        }),
      }),
    }),
  }),
  query: new Proxy({}, {
    get() {
      legacyQueried = true;
      return {};
    },
  }),
};

mock.module("@/db/connection", () => ({ db }));

import { ModerationReviewService } from "@/features/ai-moderation/services/review.service";

beforeEach(() => {
  insertedValues.length = 0;
  updatedValues.length = 0;
  operations.length = 0;
  insertError = null;
  contextRows = [];
  legacyQueried = false;
});

describe("ModerationReviewService", () => {
  it("confirms once, inserts feedback before resolving linked case", async () => {
    expect(await ModerationReviewService.confirm(7, "g1", "ai-mod", "mod1")).toBe(true);

    expect(insertedValues[0]).toMatchObject({
      targetId: 7,
      guildId: "g1",
      feature: "ai-mod",
      action: "confirm",
      reviewerId: "mod1",
    });
    expect(updatedValues[0]).toMatchObject({
      resolved: true,
      resolvedBy: "mod1",
      resolvedAction: "confirm",
      resolvedAt: expect.any(Date),
    });
    expect(operations).toEqual(["insert", "update"]);
  });

  it("returns false and skips case update on duplicate feedback", async () => {
    insertError = new Error("UNIQUE constraint failed: moderation_feedback.target_id");

    expect(await ModerationReviewService.confirm(7, "g1", "job-guard", "mod1")).toBe(false);
    expect(updatedValues).toHaveLength(0);
  });

  it("stores correction and extends target retention to 365 days", async () => {
    const before = Date.now();

    expect(await ModerationReviewService.correct({
      targetId: 7,
      guildId: "g1",
      feature: "job-guard",
      expectedLabel: "allow",
      reason: "Pregunta de búsqueda personal",
      reviewerId: "mod1",
    })).toBe(true);

    expect(insertedValues[0]).toMatchObject({
      action: "correct",
      expectedLabel: "allow",
      reason: "Pregunta de búsqueda personal",
    });
    expect(updatedValues).toHaveLength(2);
    expect((updatedValues[1].expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
      before + 365 * 24 * 60 * 60 * 1_000,
    );
  });

  it("round-robins correction labels, ignores confirmations, and caps context at 12", async () => {
    contextRows = [
      ...Array.from({ length: 13 }, (_, i) => ({
        action: "correct",
        expectedLabel: "malicious",
        content: `malicious-${i}`,
        reason: `reason-${i}`,
      })),
      { action: "confirm", expectedLabel: "malicious", content: "confirmed", reason: null },
      { action: "correct", expectedLabel: "selfpromo", content: "selfpromo-1", reason: "annotation" },
    ];

    const context = await ModerationReviewService.listCorrectionContext("g1", "ai-mod");
    const entries = context.match(/<correccion /g) ?? [];

    expect(entries).toHaveLength(12);
    expect(context).toContain("selfpromo-1");
    expect(context).not.toContain("confirmed");
    expect(context).toContain("<anotacion_moderador>annotation</anotacion_moderador>");
    expect(context.indexOf("selfpromo-1")).toBeLessThan(context.indexOf("malicious-10"));
    expect(legacyQueried).toBe(false);
  });
});
