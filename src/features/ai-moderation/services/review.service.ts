import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/connection";
import {
  aiModCasesTable,
  jobGuardCasesTable,
  moderationFeedbackTable,
  moderationTargetsTable,
} from "@/db/schema";
import type { ModerationFeature, ModerationLabel } from "../types";

const YEAR_MS = 365 * 24 * 60 * 60 * 1_000;
const CONTEXT_POOL_LIMIT = 48;
const CONTEXT_LIMIT = 12;

type CorrectionInput = {
  targetId: number;
  guildId: string;
  feature: ModerationFeature;
  expectedLabel: "allow" | ModerationLabel;
  reason: string | null;
  reviewerId: string;
};

type CorrectionRow = {
  action: string;
  expectedLabel: string | null;
  content: string;
  reason: string | null;
};

function isAllowedLabel(feature: ModerationFeature, label: string): boolean {
  if (label === "allow") return true;
  return feature === "ai-mod"
    ? label === "malicious" || label === "selfpromo"
    : label === "job_offer";
}

function isUniqueConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint|conflict/i.test(message);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&apos;";
    }
  });
}

async function resolveCase(
  tx: Pick<typeof db, "update">,
  input: {
    targetId: number;
    reviewerId: string;
    feature: ModerationFeature;
    action: "confirm" | "correct";
    at: Date;
  },
): Promise<void> {
  const values = {
    resolved: true,
    resolvedBy: input.reviewerId,
    resolvedAction: input.action,
    resolvedAt: input.at,
    feedbackAction: input.action,
    promptPending: false,
    promptError: null,
  };

  if (input.feature === "ai-mod") {
    await tx
      .update(aiModCasesTable)
      .set(values)
      .where(eq(aiModCasesTable.moderationTargetId, input.targetId));
    return;
  }

  await tx
    .update(jobGuardCasesTable)
    .set(values)
    .where(eq(jobGuardCasesTable.moderationTargetId, input.targetId));
}

async function writeFeedback(
  input: {
    targetId: number;
    guildId: string;
    feature: ModerationFeature;
    action: "confirm" | "correct";
    expectedLabel: string | null;
    reason: string | null;
    reviewerId: string;
  },
): Promise<boolean> {
  const at = new Date();

  try {
    return await db.transaction(async (tx) => {
      await tx.insert(moderationFeedbackTable).values({
        targetId: input.targetId,
        guildId: input.guildId,
        feature: input.feature,
        action: input.action,
        expectedLabel: input.expectedLabel,
        reason: input.reason,
        reviewerId: input.reviewerId,
        createdAt: at,
      });

      const resolution = {
        targetId: input.targetId,
        reviewerId: input.reviewerId,
        feature: input.feature,
        action: input.action,
        at,
      };
      await resolveCase(tx, resolution);

      if (input.action === "correct") {
        await tx
          .update(moderationTargetsTable)
          .set({ expiresAt: new Date(at.getTime() + YEAR_MS) })
          .where(eq(moderationTargetsTable.id, input.targetId));
      }

      return true;
    });
  } catch (error) {
    if (isUniqueConflict(error)) return false;
    throw error;
  }
}

function roundRobin(rows: CorrectionRow[]): CorrectionRow[] {
  const groups = new Map<string, CorrectionRow[]>();
  for (const row of rows) {
    if (row.action !== "correct" || !row.expectedLabel) continue;
    const group = groups.get(row.expectedLabel) ?? [];
    group.push(row);
    groups.set(row.expectedLabel, group);
  }

  const selected: CorrectionRow[] = [];
  while (selected.length < CONTEXT_LIMIT) {
    let added = false;
    for (const group of groups.values()) {
      const row = group.shift();
      if (!row) continue;
      selected.push(row);
      added = true;
      if (selected.length === CONTEXT_LIMIT) break;
    }
    if (!added) break;
  }
  return selected;
}

function formatContext(rows: CorrectionRow[]): string {
  return roundRobin(rows).map((row) => {
    const expected = escapeXml(row.expectedLabel ?? "allow");
    const content = escapeXml(row.content);
    const reason = escapeXml(row.reason ?? "");
    return `<correccion expected="${expected}">\n<mensaje>${content}</mensaje>\n<anotacion_moderador>${reason}</anotacion_moderador>\n</correccion>`;
  }).join("\n");
}

export class ModerationReviewService {
  static confirm(
    targetId: number,
    guildId: string,
    feature: ModerationFeature,
    reviewerId: string,
  ): Promise<boolean> {
    return writeFeedback({
      targetId,
      guildId,
      feature,
      action: "confirm",
      expectedLabel: null,
      reason: null,
      reviewerId,
    });
  }

  static correct(input: CorrectionInput): Promise<boolean> {
    if (!isAllowedLabel(input.feature, input.expectedLabel)) return Promise.resolve(false);
    return writeFeedback({
      targetId: input.targetId,
      guildId: input.guildId,
      feature: input.feature,
      action: "correct",
      expectedLabel: input.expectedLabel,
      reason: input.reason,
      reviewerId: input.reviewerId,
    });
  }

  static async listCorrectionContext(
    guildId: string,
    feature: ModerationFeature,
  ): Promise<string> {
    const rows = await db
      .select({
        action: moderationFeedbackTable.action,
        expectedLabel: moderationFeedbackTable.expectedLabel,
        content: moderationTargetsTable.content,
        reason: moderationFeedbackTable.reason,
      })
      .from(moderationFeedbackTable)
      .innerJoin(
        moderationTargetsTable,
        eq(moderationFeedbackTable.targetId, moderationTargetsTable.id),
      )
      .where(and(
        eq(moderationFeedbackTable.guildId, guildId),
        eq(moderationFeedbackTable.feature, feature),
        eq(moderationFeedbackTable.action, "correct"),
      ))
      .orderBy(desc(moderationFeedbackTable.createdAt))
      .limit(CONTEXT_POOL_LIMIT) as unknown as CorrectionRow[];

    return formatContext(rows);
  }
}
