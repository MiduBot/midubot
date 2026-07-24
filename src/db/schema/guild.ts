import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const guildConfigsTable = sqliteTable("guild_configs", {
  guildId: text("guild_id").primaryKey(),
  language: text("language", { enum: ["es", "en"] })
    .notNull()
    .default("es"),
  lineFilterEnabled: integer("line_filter_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  lineFilterThreshold: integer("line_filter_threshold")
    .notNull()
    .default(20),
  lineFilterRiskLimit: integer("line_filter_risk_limit")
    .notNull()
    .default(3),
  lineFilterExemptChannels: text("line_filter_exempt_channels")
    .notNull()
    .default("[]"),
  aiModEnabled: integer("ai_mod_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  linkNewcomerEnabled: integer("link_newcomer_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  linkNewcomerThresholdMs: integer("link_newcomer_threshold_ms")
    .notNull()
    .default(7 * 24 * 60 * 60 * 1000),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
