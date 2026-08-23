import { db } from "@/db/connection";
import { aiModCasesTable } from "@/db/schema";
import { and, count, desc, eq, SQL } from "drizzle-orm";

export interface CaseInsertPayload {
  moderationTargetId?: number | null;
  guildId: string;
  authorId: string;
  channelId: string;
  messageId: string;
  content: string;
  verdict: number;
  confidence: number;
  platform: number;
  reason: string;
  actionTaken: string;
  resolved?: boolean;
  resolvedBy?: string | null;
  resolvedAction?: string | null;
}

export type CaseFilter = "pending" | "resolved" | "all";
export type FeedbackAction = "correct" | "incorrect";

export interface CaseRow extends Omit<CaseInsertPayload, "resolvedAction"> {
  id: number;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAction: string | null;
  feedbackAction: string | null;
  promptPending: boolean;
  promptError: string | null;
  createdAt?: Date | null;
}

function filterWhere(guildId: string, filter: CaseFilter): SQL {
  if (filter === "pending") {
    return and(eq(aiModCasesTable.guildId, guildId), eq(aiModCasesTable.resolved, false))!;
  }
  if (filter === "resolved") {
    return and(eq(aiModCasesTable.guildId, guildId), eq(aiModCasesTable.resolved, true))!;
  }
  return eq(aiModCasesTable.guildId, guildId);
}

export class CasesService {
  static async insert(payload: CaseInsertPayload): Promise<number> {
    const result = (await db.insert(aiModCasesTable).values({ ...payload, createdAt: new Date() })) as unknown as {
      lastInsertRowid?: bigint | number;
    };
    const id = result?.lastInsertRowid;
    if (typeof id === "bigint") return Number(id);
    if (typeof id === "number") return id;
    return 0;
  }

  static async get(id: number): Promise<CaseRow | null> {
    const row = await db.query.aiModCasesTable.findFirst({
      where: eq(aiModCasesTable.id, id),
    });
    if (!row) return null;
    return row as unknown as CaseRow;
  }

  static async list(
    guildId: string,
    filter: CaseFilter,
    limit: number,
    offset: number,
  ): Promise<CaseRow[]> {
    const rows = await db
      .select()
      .from(aiModCasesTable)
      .where(filterWhere(guildId, filter))
      .orderBy(desc(aiModCasesTable.createdAt), desc(aiModCasesTable.id))
      .limit(limit)
      .offset(offset);
    return rows as unknown as CaseRow[];
  }

  static async count(guildId: string, filter: CaseFilter): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(aiModCasesTable)
      .where(filterWhere(guildId, filter));
    return Number(row?.value ?? 0);
  }

  static async markFeedbackPending(
    id: number,
    resolvedBy: string,
    feedbackAction: FeedbackAction,
    promptError?: string | null,
  ): Promise<void> {
    await db
      .update(aiModCasesTable)
      .set({
        feedbackAction,
        promptPending: true,
        promptError: promptError ?? "AI unavailable",
        resolvedBy,
      })
      .where(eq(aiModCasesTable.id, id));
  }

  static async markResolved(
    id: number,
    resolvedBy: string,
    resolvedAction: FeedbackAction,
  ): Promise<void> {
    await db
      .update(aiModCasesTable)
      .set({
        resolved: true,
        resolvedBy,
        resolvedAction,
        feedbackAction: resolvedAction,
        resolvedAt: new Date(),
        promptPending: false,
        promptError: null,
      })
      .where(eq(aiModCasesTable.id, id));
  }
}
