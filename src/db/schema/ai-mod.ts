import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const aiModModRolesTable = sqliteTable(
  "ai_mod_mod_roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    roleId: text("role_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    guildRoleUnq: uniqueIndex("ai_mod_mod_roles_guild_role_unq").on(t.guildId, t.roleId),
  }),
);

export const aiModIgnoredChannelsTable = sqliteTable(
  "ai_mod_ignored_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    targetId: text("target_id").notNull(),
    targetType: text("target_type", { enum: ["channel", "category"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    guildTargetUnq: uniqueIndex("ai_mod_ignored_channels_guild_target_unq").on(t.guildId, t.targetId),
  }),
);

export const aiModNotifyTargetsTable = sqliteTable(
  "ai_mod_notify_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    targetId: text("target_id").notNull(),
    targetType: text("target_type", { enum: ["user", "role"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    guildTargetUnq: uniqueIndex("ai_mod_notify_targets_guild_target_unq").on(t.guildId, t.targetId),
  }),
);

export const aiModSelfpromoBypassChannelsTable = sqliteTable(
  "ai_mod_selfpromo_bypass_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    guildChannelUnq: uniqueIndex("ai_mod_selfpromo_bypass_guild_channel_unq").on(t.guildId, t.channelId),
  }),
);

export const aiModMaliciousMessagesTable = sqliteTable(
  "ai_mod_malicious_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    content: text("content").notNull(),
    malicious: integer("malicious", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    guildContentUnq: uniqueIndex("ai_mod_malicious_messages_guild_content_unq").on(t.guildId, t.content),
  }),
);

export const aiModPromptsTable = sqliteTable("ai_mod_ai_prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  prompt: text("prompt").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const aiModCasesTable = sqliteTable("ai_mod_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  authorId: text("author_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  content: text("content").notNull(),
  verdict: integer("verdict").notNull(),
  confidence: real("confidence").notNull(),
  platform: integer("platform").notNull().default(0),
  reason: text("reason"),
  actionTaken: text("action_taken"),
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
