import { db } from "@/db/connection";
import {
  moderationRunsTable,
  moderationTargetsTable,
} from "@/db/schema";
import type { AIGenerationResult } from "@/features/ai-mod/services/ai-client.service";
import {
  and,
  desc,
  eq,
  gte,
  lte,
  notExists,
  or,
} from "drizzle-orm";
import type {
  AdjudicationKind,
  AdjudicationResult,
  EvaluationAttempt,
  EvaluationStatus,
  ModerationCandidate,
  ModerationFeature,
  ModerationLabel,
  ModerationMode,
  ModelEvaluation,
} from "../types";
import type { DualEvaluationResult } from "./evaluator.service";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface PersistRunInput {
  guildId: string;
  feature: ModerationFeature;
  mode: ModerationMode;
  triggerMessageId: string;
  reporterId: string | null;
  reportContent: string | null;
  candidates: ModerationCandidate[];
  evaluation: DualEvaluationResult;
  adjudication: AdjudicationResult;
}

export interface PersistedRun {
  runId: number;
  targetIdsByCandidate: Map<number, number>;
}

export interface ModerationTargetRow {
  id: number;
  runId: number;
  candidateIndex: number;
  guildId: string;
  messageId: string;
  authorId: string;
  channelId: string;
  content: string;
  attachments: ModerationCandidate["attachments"];
  finalLabel: ModerationLabel | null;
  action: string;
  actionStatus: string;
  audited: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export interface ModerationRunRow {
  id: number;
  guildId: string;
  feature: ModerationFeature;
  mode: ModerationMode;
  triggerMessageId: string;
  reporterId: string | null;
  reportContent: string | null;
  primary: EvaluationAttempt;
  judge: EvaluationAttempt;
  finalKind: AdjudicationKind;
  decisionReason: string;
  createdAt: Date;
}

export interface ModerationDigestRow extends ModerationTargetRow {
  feature: ModerationFeature;
  finalKind: AdjudicationKind;
  decisionReason: string;
  primaryStatus: EvaluationStatus;
  judgeStatus: EvaluationStatus;
}

type InsertResult = { lastInsertRowid?: bigint | number };

function insertId(result: unknown): number {
  const value = (result as InsertResult | null)?.lastInsertRowid;
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" ? value : 0;
}

function outputForAttempt(
  attempt: EvaluationAttempt,
  generation: AIGenerationResult | null,
): string | null {
  if (attempt.status === "ok") return JSON.stringify(attempt.evaluation);
  return generation?.text ?? null;
}

function errorForAttempt(attempt: EvaluationAttempt): string | null {
  return attempt.status === "ok" ? null : (attempt.error ?? null);
}

function attemptFromColumns(
  status: string,
  output: string | null,
  error: string | null,
): EvaluationAttempt {
  if (status === "ok") {
    if (!output) throw new Error("stored moderation evaluation has no output");
    return { status: "ok", evaluation: JSON.parse(output) as ModelEvaluation };
  }
  return {
    status: status as Exclude<EvaluationStatus, "ok">,
    ...(error ? { error } : {}),
  };
}

function targetFromRow(row: typeof moderationTargetsTable.$inferSelect): ModerationTargetRow {
  const { attachmentsJson, finalLabel, ...target } = row;
  return {
    ...target,
    attachments: JSON.parse(attachmentsJson) as ModerationCandidate["attachments"],
    finalLabel: finalLabel as ModerationLabel | null,
  };
}

type DigestSelectRow = typeof moderationTargetsTable.$inferSelect & {
  feature: ModerationFeature;
  finalKind: AdjudicationKind;
  decisionReason: string;
  primaryStatus: EvaluationStatus;
  judgeStatus: EvaluationStatus;
};

function digestFromRow(row: DigestSelectRow): ModerationDigestRow {
  const { feature, finalKind, decisionReason, primaryStatus, judgeStatus, ...target } = row;
  return {
    ...targetFromRow(target),
    feature,
    finalKind,
    decisionReason,
    primaryStatus,
    judgeStatus,
  };
}

const digestSelection = {
  id: moderationTargetsTable.id,
  runId: moderationTargetsTable.runId,
  candidateIndex: moderationTargetsTable.candidateIndex,
  guildId: moderationTargetsTable.guildId,
  messageId: moderationTargetsTable.messageId,
  authorId: moderationTargetsTable.authorId,
  channelId: moderationTargetsTable.channelId,
  content: moderationTargetsTable.content,
  attachmentsJson: moderationTargetsTable.attachmentsJson,
  finalLabel: moderationTargetsTable.finalLabel,
  action: moderationTargetsTable.action,
  actionStatus: moderationTargetsTable.actionStatus,
  audited: moderationTargetsTable.audited,
  expiresAt: moderationTargetsTable.expiresAt,
  createdAt: moderationTargetsTable.createdAt,
  feature: moderationRunsTable.feature,
  finalKind: moderationRunsTable.finalKind,
  decisionReason: moderationRunsTable.decisionReason,
  primaryStatus: moderationRunsTable.primaryStatus,
  judgeStatus: moderationRunsTable.judgeStatus,
};

export class ModerationRunsService {
  static async create(input: PersistRunInput): Promise<PersistedRun> {
    return db.transaction(async (tx) => {
      const primaryGeneration = input.evaluation.primaryGeneration;
      const judgeGeneration = input.evaluation.judgeGeneration;
      const runResult = await tx.insert(moderationRunsTable).values({
        guildId: input.guildId,
        feature: input.feature,
        mode: input.mode,
        triggerMessageId: input.triggerMessageId,
        reporterId: input.reporterId,
        reportContent: input.reportContent,
        primaryStatus: input.evaluation.primary.status,
        primaryOutput: outputForAttempt(input.evaluation.primary, primaryGeneration),
        primaryError: errorForAttempt(input.evaluation.primary),
        primaryModel: primaryGeneration?.model ?? null,
        primaryPromptVersion: `${input.feature}-primary-v1`,
        primaryLatencyMs: primaryGeneration?.latencyMs ?? null,
        primaryInputTokens: primaryGeneration?.inputTokens ?? null,
        primaryOutputTokens: primaryGeneration?.outputTokens ?? null,
        judgeStatus: input.evaluation.judge.status,
        judgeOutput: outputForAttempt(input.evaluation.judge, judgeGeneration),
        judgeError: errorForAttempt(input.evaluation.judge),
        judgeModel: judgeGeneration?.model ?? null,
        judgePromptVersion: `${input.feature}-judge-v1`,
        judgeLatencyMs: judgeGeneration?.latencyMs ?? null,
        judgeInputTokens: judgeGeneration?.inputTokens ?? null,
        judgeOutputTokens: judgeGeneration?.outputTokens ?? null,
        finalKind: input.adjudication.kind,
        decisionReason: input.adjudication.reason,
      });
      const runId = insertId(runResult);
      if (runId === 0) throw new Error("moderation run insert returned no ID");

      const expiresAt = new Date(
        Date.now() + (input.adjudication.kind === "auto_allow" ? 30 : 90) * DAY_MS,
      );
      const labels = new Map(
        input.adjudication.targets.map((target) => [target.candidateIndex, target.label]),
      );
      const targetIdsByCandidate = new Map<number, number>();

      for (const candidate of input.candidates) {
        const targetResult = await tx.insert(moderationTargetsTable).values({
          runId,
          candidateIndex: candidate.index,
          guildId: input.guildId,
          messageId: candidate.messageId,
          authorId: candidate.authorId,
          channelId: candidate.channelId,
          content: candidate.content,
          attachmentsJson: JSON.stringify(candidate.attachments),
          finalLabel: labels.get(candidate.index) ?? null,
          expiresAt,
        });
        const targetId = insertId(targetResult);
        if (targetId === 0) throw new Error("moderation target insert returned no ID");
        targetIdsByCandidate.set(candidate.index, targetId);
      }

      return { runId, targetIdsByCandidate };
    });
  }

  static async getRun(runId: number): Promise<ModerationRunRow | null> {
    const row = await db.query.moderationRunsTable.findFirst({
      where: eq(moderationRunsTable.id, runId),
    });
    if (!row) return null;
    return {
      id: row.id,
      guildId: row.guildId,
      feature: row.feature as ModerationFeature,
      mode: row.mode as ModerationMode,
      triggerMessageId: row.triggerMessageId,
      reporterId: row.reporterId,
      reportContent: row.reportContent,
      primary: attemptFromColumns(row.primaryStatus, row.primaryOutput, row.primaryError),
      judge: attemptFromColumns(row.judgeStatus, row.judgeOutput, row.judgeError),
      finalKind: row.finalKind as AdjudicationKind,
      decisionReason: row.decisionReason,
      createdAt: row.createdAt,
    };
  }

  static async getTarget(targetId: number): Promise<ModerationTargetRow | null> {
    const row = await db.query.moderationTargetsTable.findFirst({
      where: eq(moderationTargetsTable.id, targetId),
    });
    return row ? targetFromRow(row) : null;
  }

  static async setTargetAction(
    targetId: number,
    action: string,
    status: string,
  ): Promise<void> {
    await db
      .update(moderationTargetsTable)
      .set({ action, actionStatus: status })
      .where(eq(moderationTargetsTable.id, targetId));
  }

  static async listDigestRows(
    guildId: string,
    since: Date,
  ): Promise<ModerationDigestRow[]> {
    const rows = await db
      .select(digestSelection)
      .from(moderationTargetsTable)
      .innerJoin(moderationRunsTable, eq(moderationTargetsTable.runId, moderationRunsTable.id))
      .where(
        and(
          eq(moderationTargetsTable.guildId, guildId),
          gte(moderationTargetsTable.createdAt, since),
        ),
      )
      .orderBy(desc(moderationTargetsTable.createdAt));
    return (rows as DigestSelectRow[]).map(digestFromRow);
  }

  static async listPendingReviews(guildId: string): Promise<ModerationDigestRow[]> {
    const rows = await db
      .select(digestSelection)
      .from(moderationTargetsTable)
      .innerJoin(moderationRunsTable, eq(moderationTargetsTable.runId, moderationRunsTable.id))
      .where(
        and(
          eq(moderationTargetsTable.guildId, guildId),
          eq(moderationTargetsTable.actionStatus, "pending"),
          or(
            eq(moderationTargetsTable.audited, true),
            eq(moderationRunsTable.finalKind, "review"),
            eq(moderationRunsTable.finalKind, "temporary_action"),
            eq(moderationRunsTable.finalKind, "technical_error"),
          ),
        ),
      )
      .orderBy(desc(moderationTargetsTable.createdAt));
    return (rows as DigestSelectRow[]).map(digestFromRow);
  }

  static async purgeExpired(now: Date): Promise<number> {
    return db.transaction(async (tx) => {
      const deletedTargets = await tx
        .delete(moderationTargetsTable)
        .where(lte(moderationTargetsTable.expiresAt, now))
        .returning({ id: moderationTargetsTable.id, runId: moderationTargetsTable.runId });

      await tx.delete(moderationRunsTable).where(
        notExists(
          tx
            .select({ id: moderationTargetsTable.id })
            .from(moderationTargetsTable)
            .where(eq(moderationTargetsTable.runId, moderationRunsTable.id)),
        ),
      );

      return deletedTargets.length;
    });
  }
}
