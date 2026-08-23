import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { DualEvaluationResult } from "@/features/ai-moderation/services/evaluator.service";
import type {
  AdjudicationResult,
  ModerationCandidate,
} from "@/features/ai-moderation/types";

const insertResults: unknown[] = [];
const insertedValues: unknown[] = [];
const updatedValues: unknown[] = [];
let runRow: unknown;
let targetRow: unknown;
let selectedRows: unknown[] = [];
let deletedRows: unknown[] = [];

const selectChain = {
  from: () => selectChain,
  innerJoin: () => selectChain,
  where: () => selectChain,
  orderBy: () => Promise.resolve(selectedRows),
};

const db = {
  transaction: async <T>(callback: (tx: typeof db) => Promise<T>): Promise<T> => callback(db),
  insert: () => ({
    values: (values: unknown) => {
      insertedValues.push(values);
      return Promise.resolve(insertResults.shift());
    },
  }),
  query: {
    moderationRunsTable: { findFirst: () => Promise.resolve(runRow) },
    moderationTargetsTable: { findFirst: () => Promise.resolve(targetRow) },
  },
  update: () => ({
    set: (values: unknown) => {
      updatedValues.push(values);
      return { where: () => Promise.resolve() };
    },
  }),
  select: () => selectChain,
  delete: () => ({
    where: () => ({
      returning: () => Promise.resolve(deletedRows),
      then: (resolve: (value: unknown) => void) => resolve(undefined),
    }),
  }),
};

mock.module("@/db/connection", () => ({ db }));

import { ModerationRunsService } from "@/features/ai-moderation/services/runs.service";

const DAY_MS = 24 * 60 * 60 * 1_000;

const candidates: ModerationCandidate[] = [
  {
    index: 0,
    messageId: "m1",
    authorId: "u1",
    channelId: "c1",
    content: "Hire me",
    attachments: [
      {
        url: "https://cdn.example/image.png",
        name: "image.png",
        contentType: "image/png",
        hash: "abc123",
      },
    ],
  },
  {
    index: 1,
    messageId: "m2",
    authorId: "u2",
    channelId: "c1",
    content: "Hello",
    attachments: [],
  },
];

const evaluation: DualEvaluationResult = {
  primary: {
    status: "ok",
    evaluation: {
      outcome: "violation",
      confidence: 0.94,
      targets: [
        {
          candidateIndex: 0,
          label: "job_offer",
          evidence: [{ quote: "Hire me", policyTag: "hiring" }],
        },
      ],
      reason: "Job offer",
    },
  },
  judge: {
    status: "ok",
    evaluation: {
      outcome: "violation",
      confidence: 0.92,
      targets: [
        {
          candidateIndex: 0,
          label: "job_offer",
          evidence: [{ quote: "Hire me", policyTag: "hiring" }],
        },
      ],
      reason: "Confirmed",
    },
  },
  primaryGeneration: {
    text: "primary raw output",
    model: "primary-model",
    latencyMs: 12,
    inputTokens: 30,
    outputTokens: 10,
    finishReason: "stop",
  },
  judgeGeneration: {
    text: "judge raw output",
    model: "judge-model",
    latencyMs: 14,
    inputTokens: 31,
    outputTokens: 11,
    finishReason: "stop",
  },
};

function adjudication(kind: AdjudicationResult["kind"]): AdjudicationResult {
  return {
    kind,
    targets: kind === "auto_allow" ? [] : [{ candidateIndex: 0, label: "job_offer" }],
    reason: `${kind} reason`,
  };
}

function input(kind: AdjudicationResult["kind"]) {
  return {
    guildId: "g1",
    feature: "job-guard" as const,
    mode: "shadow" as const,
    triggerMessageId: "trigger1",
    reporterId: null,
    reportContent: null,
    candidates,
    evaluation,
    adjudication: adjudication(kind),
  };
}

beforeEach(() => {
  insertResults.length = 0;
  insertedValues.length = 0;
  updatedValues.length = 0;
  runRow = undefined;
  targetRow = undefined;
  selectedRows = [];
  deletedRows = [];
});

describe("ModerationRunsService", () => {
  it("returns stable run and target IDs and stores JSON snapshots once", async () => {
    insertResults.push(
      { lastInsertRowid: 11n },
      { lastInsertRowid: 21n },
      { lastInsertRowid: 22n },
    );
    const startedAt = Date.now();

    const result = await ModerationRunsService.create(input("auto_allow"));

    expect(result.runId).toBe(11);
    expect([...result.targetIdsByCandidate]).toEqual([
      [0, 21],
      [1, 22],
    ]);

    const storedRun = insertedValues[0] as Record<string, unknown>;
    expect(JSON.parse(storedRun.primaryOutput as string)).toEqual(
      evaluation.primary.status === "ok" ? evaluation.primary.evaluation : null,
    );
    expect(typeof JSON.parse(storedRun.primaryOutput as string)).toBe("object");
    expect(storedRun.primaryModel).toBe("primary-model");
    expect(storedRun.judgeModel).toBe("judge-model");

    const storedTarget = insertedValues[1] as Record<string, unknown>;
    expect(JSON.parse(storedTarget.attachmentsJson as string)).toEqual(candidates[0].attachments);
    expect(typeof JSON.parse(storedTarget.attachmentsJson as string)).toBe("object");
    expect((storedTarget.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
      startedAt + 30 * DAY_MS,
    );
    expect((storedTarget.expiresAt as Date).getTime()).toBeLessThan(
      startedAt + 30 * DAY_MS + 1_000,
    );
  });

  it.each(["auto_violation", "temporary_action", "review", "technical_error"] as const)(
    "keeps %s targets for 90 days",
    async (kind) => {
      insertResults.push(
        { lastInsertRowid: 11 },
        { lastInsertRowid: 21 },
        { lastInsertRowid: 22 },
      );
      const startedAt = Date.now();

      await ModerationRunsService.create(input(kind));

      const storedTarget = insertedValues[1] as Record<string, unknown>;
      expect((storedTarget.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
        startedAt + 90 * DAY_MS,
      );
      expect((storedTarget.expiresAt as Date).getTime()).toBeLessThan(
        startedAt + 90 * DAY_MS + 1_000,
      );
      expect(storedTarget.finalLabel).toBe("job_offer");
    },
  );

  it("throws when the run insert does not return an ID", async () => {
    insertResults.push({});
    await expect(ModerationRunsService.create(input("review"))).rejects.toThrow(
      "moderation run insert returned no ID",
    );
  });

  it("throws when a target insert does not return an ID", async () => {
    insertResults.push({ lastInsertRowid: 11n }, {});
    await expect(ModerationRunsService.create(input("review"))).rejects.toThrow(
      "moderation target insert returned no ID",
    );
  });

  it("reconstructs a run and its evaluation attempts", async () => {
    runRow = {
      id: 11,
      guildId: "g1",
      feature: "job-guard",
      mode: "assisted",
      triggerMessageId: "trigger1",
      reporterId: null,
      reportContent: null,
      primaryStatus: "ok",
      primaryOutput: JSON.stringify(
        evaluation.primary.status === "ok" ? evaluation.primary.evaluation : null,
      ),
      primaryError: null,
      judgeStatus: "timeout",
      judgeOutput: null,
      judgeError: "timed out",
      finalKind: "review",
      decisionReason: "needs review",
      createdAt: new Date("2026-08-23T00:00:00Z"),
    };

    const result = await ModerationRunsService.getRun(11);

    expect(result?.primary).toEqual(evaluation.primary);
    expect(result?.judge).toEqual({ status: "timeout", error: "timed out" });
    expect(result?.finalKind).toBe("review");
  });

  it("returns null for missing runs and targets", async () => {
    expect(await ModerationRunsService.getRun(99)).toBeNull();
    expect(await ModerationRunsService.getTarget(99)).toBeNull();
  });

  it("parses target attachment snapshots", async () => {
    targetRow = {
      id: 21,
      runId: 11,
      candidateIndex: 0,
      guildId: "g1",
      messageId: "m1",
      authorId: "u1",
      channelId: "c1",
      content: "Hire me",
      attachmentsJson: JSON.stringify(candidates[0].attachments),
      finalLabel: "job_offer",
      action: "none",
      actionStatus: "pending",
      audited: false,
      expiresAt: new Date("2026-11-21T00:00:00Z"),
      createdAt: new Date("2026-08-23T00:00:00Z"),
    };

    const result = await ModerationRunsService.getTarget(21);

    expect(result?.attachments).toEqual(candidates[0].attachments);
    expect(result).not.toHaveProperty("attachmentsJson");
  });

  it("updates target action state", async () => {
    await ModerationRunsService.setTargetAction(21, "delete", "succeeded");
    expect(updatedValues).toEqual([{ action: "delete", actionStatus: "succeeded" }]);
  });

  it("maps digest rows and pending review rows", async () => {
    selectedRows = [
      {
        id: 21,
        runId: 11,
        candidateIndex: 0,
        guildId: "g1",
        messageId: "m1",
        authorId: "u1",
        channelId: "c1",
        content: "Hire me",
        attachmentsJson: JSON.stringify(candidates[0].attachments),
        finalLabel: "job_offer",
        action: "delete",
        actionStatus: "succeeded",
        audited: false,
        expiresAt: new Date("2026-11-21T00:00:00Z"),
        createdAt: new Date("2026-08-23T00:00:00Z"),
        feature: "job-guard",
        finalKind: "auto_violation",
        decisionReason: "confirmed",
        primaryStatus: "ok",
        judgeStatus: "ok",
      },
    ];

    const digest = await ModerationRunsService.listDigestRows(
      "g1",
      new Date("2026-08-22T00:00:00Z"),
    );
    const pending = await ModerationRunsService.listPendingReviews("g1");

    expect(digest[0].attachments).toEqual(candidates[0].attachments);
    expect(pending).toEqual(digest);
  });

  it("returns the number of expired targets purged", async () => {
    deletedRows = [
      { id: 21, runId: 11 },
      { id: 22, runId: 12 },
    ];
    expect(await ModerationRunsService.purgeExpired(new Date())).toBe(2);
  });
});
