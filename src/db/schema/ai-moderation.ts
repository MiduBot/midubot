import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const moderationRunsTable = sqliteTable(
  "moderation_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    feature: text("feature", { enum: ["ai-mod", "job-guard"] }).notNull(),
    mode: text("mode", { enum: ["shadow", "assisted", "autonomous"] }).notNull(),
    triggerMessageId: text("trigger_message_id").notNull(),
    reporterId: text("reporter_id"),
    reportContent: text("report_content"),
    primaryStatus: text("primary_status").notNull(),
    primaryOutput: text("primary_output"),
    primaryError: text("primary_error"),
    primaryModel: text("primary_model"),
    primaryPromptVersion: text("primary_prompt_version").notNull(),
    primaryLatencyMs: integer("primary_latency_ms"),
    primaryInputTokens: integer("primary_input_tokens"),
    primaryOutputTokens: integer("primary_output_tokens"),
    judgeStatus: text("judge_status").notNull(),
    judgeOutput: text("judge_output"),
    judgeError: text("judge_error"),
    judgeModel: text("judge_model"),
    judgePromptVersion: text("judge_prompt_version").notNull(),
    judgeLatencyMs: integer("judge_latency_ms"),
    judgeInputTokens: integer("judge_input_tokens"),
    judgeOutputTokens: integer("judge_output_tokens"),
    finalKind: text("final_kind").notNull(),
    decisionReason: text("decision_reason").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    guildCreatedIdx: index("moderation_runs_guild_created_idx").on(t.guildId, t.createdAt),
  }),
);

export const moderationTargetsTable = sqliteTable(
  "moderation_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => moderationRunsTable.id, { onDelete: "cascade" }),
    candidateIndex: integer("candidate_index").notNull(),
    guildId: text("guild_id").notNull(),
    messageId: text("message_id").notNull(),
    authorId: text("author_id").notNull(),
    channelId: text("channel_id").notNull(),
    content: text("content").notNull(),
    attachmentsJson: text("attachments_json").notNull().default("[]"),
    finalLabel: text("final_label"),
    action: text("action").notNull().default("none"),
    actionStatus: text("action_status").notNull().default("pending"),
    audited: integer("audited", { mode: "boolean" }).notNull().default(false),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    runCandidateUnq: uniqueIndex("moderation_targets_run_candidate_unq").on(
      t.runId,
      t.candidateIndex,
    ),
    guildExpiresIdx: index("moderation_targets_guild_expires_idx").on(
      t.guildId,
      t.expiresAt,
    ),
  }),
);

export const moderationFeedbackTable = sqliteTable(
  "moderation_feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetId: integer("target_id")
      .notNull()
      .references(() => moderationTargetsTable.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    feature: text("feature", { enum: ["ai-mod", "job-guard"] }).notNull(),
    action: text("action", { enum: ["confirm", "correct"] }).notNull(),
    expectedLabel: text("expected_label"),
    reason: text("reason"),
    reviewerId: text("reviewer_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    targetUnq: uniqueIndex("moderation_feedback_target_unq").on(t.targetId),
    guildFeatureCreatedIdx: index("moderation_feedback_guild_feature_created_idx").on(
      t.guildId,
      t.feature,
      t.createdAt,
    ),
  }),
);

export const moderationActionsTable = sqliteTable(
  "moderation_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    runId: integer("run_id")
      .notNull()
      .references(() => moderationRunsTable.id, { onDelete: "cascade" }),
    targetId: integer("target_id")
      .notNull()
      .references(() => moderationTargetsTable.id, { onDelete: "cascade" }),
    actionType: text("action_type", { enum: ["delete", "timeout"] }).notNull(),
    status: text("status", { enum: ["pending", "succeeded", "failed"] }).notNull(),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    keyUnq: uniqueIndex("moderation_actions_key_unq").on(t.idempotencyKey),
  }),
);

export const moderationFeatureConfigsTable = sqliteTable(
  "moderation_feature_configs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    feature: text("feature", { enum: ["ai-mod", "job-guard"] }).notNull(),
    mode: text("mode", { enum: ["shadow", "assisted", "autonomous"] })
      .notNull()
      .default("shadow"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    guildFeatureUnq: uniqueIndex("moderation_feature_configs_guild_feature_unq").on(
      t.guildId,
      t.feature,
    ),
  }),
);

export const moderationDigestStateTable = sqliteTable("moderation_digest_state", {
  guildId: text("guild_id").primaryKey(),
  lastSentAt: integer("last_sent_at", { mode: "timestamp" }).notNull(),
});
