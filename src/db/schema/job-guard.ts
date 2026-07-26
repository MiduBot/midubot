import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const jobGuardCasesTable = sqliteTable("job_guard_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  authorId: text("author_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  content: text("content").notNull(),
  verdict: text("verdict").notNull(), // "allow" | "block"
  confidence: real("confidence").notNull(),
  reason: text("reason"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  resolvedBy: text("resolved_by"),
  resolvedAction: text("resolved_action"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  feedbackAction: text("feedback_action"),
  promptPending: integer("prompt_pending", { mode: "boolean" }).notNull().default(false),
  promptError: text("prompt_error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const jobGuardPromptsTable = sqliteTable("job_guard_prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  prompt: text("prompt").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
