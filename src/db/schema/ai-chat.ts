import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const aiChatConfigTable = sqliteTable("ai_chat_config", {
  guildId: text("guild_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  channelId: text("channel_id"),
  mode: text("mode", { enum: ["ambient", "mentions"] })
    .notNull()
    .default("ambient"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const aiChatAllowlistTable = sqliteTable(
  "ai_chat_allowlist",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    type: text("type", { enum: ["member", "role", "special"] }).notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    guildTypeEntityUnq: uniqueIndex("ai_chat_allowlist_guild_type_entity_unq").on(
      table.guildId,
      table.type,
      table.entityId,
    ),
  }),
);

export const aiChatFeedbackTable = sqliteTable(
  "ai_chat_feedback",
  {
    requestMessageId: text("request_message_id").primaryKey(),
    responseMessageId: text("response_message_id").notNull(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    requesterId: text("requester_id").notNull(),
    model: text("model").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    finishReason: text("finish_reason").notNull(),
    rating: text("rating", { enum: ["up", "down"] }),
    ratedBy: text("rated_by"),
    ratedAt: integer("rated_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    responseMessageUnq: uniqueIndex(
      "ai_chat_feedback_response_message_unq",
    ).on(table.responseMessageId),
  }),
);
