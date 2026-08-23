import { eq } from "drizzle-orm";
import { db } from "@/db/connection";
import { moderationActionsTable } from "@/db/schema";

type ActionStatus = "pending" | "succeeded" | "failed";

export interface CoordinatedActionResult {
  executed: boolean;
  status: ActionStatus;
  error: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueConflict(error: unknown): boolean {
  return /unique|constraint|conflict/i.test(errorMessage(error));
}

function existingResult(row: {
  status: string;
  error: string | null;
}): CoordinatedActionResult {
  return {
    executed: false,
    status: row.status as ActionStatus,
    error: row.error ?? null,
  };
}

async function coordinate(
  input: {
    runId: number;
    targetId: number;
    idempotencyKey: string;
    actionType: "delete" | "timeout";
  },
  effect: () => Promise<boolean>,
): Promise<CoordinatedActionResult> {
  try {
    await db.insert(moderationActionsTable).values({
      idempotencyKey: input.idempotencyKey,
      runId: input.runId,
      targetId: input.targetId,
      actionType: input.actionType,
      status: "pending",
      error: null,
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const row = await db.query.moderationActionsTable.findFirst({
      where: eq(moderationActionsTable.idempotencyKey, input.idempotencyKey),
    });
    if (!row) throw error;
    return existingResult(row);
  }

  let status: ActionStatus = "succeeded";
  let error: string | null = null;
  try {
    if (!(await effect())) {
      status = "failed";
      error = "action effect returned false";
    }
  } catch (cause) {
    status = "failed";
    error = errorMessage(cause);
  }

  await db
    .update(moderationActionsTable)
    .set({ status, error })
    .where(eq(moderationActionsTable.idempotencyKey, input.idempotencyKey));

  return { executed: true, status, error };
}

export class ModerationActionCoordinator {
  static delete(
    input: { runId: number; targetId: number; guildId: string; messageId: string },
    effect: () => Promise<boolean>,
  ): Promise<CoordinatedActionResult> {
    return coordinate({
      ...input,
      idempotencyKey: `delete:${input.guildId}:${input.messageId}`,
      actionType: "delete",
    }, effect);
  }

  static timeout(
    input: {
      runId: number;
      targetId: number;
      guildId: string;
      authorId: string;
      durationMs: number;
      now?: Date;
    },
    effect: () => Promise<boolean>,
  ): Promise<CoordinatedActionResult> {
    const hour = (input.now ?? new Date()).toISOString().slice(0, 13);
    return coordinate({
      ...input,
      idempotencyKey: `timeout:${input.guildId}:${input.authorId}:${input.durationMs}:${hour}`,
      actionType: "timeout",
    }, effect);
  }
}
