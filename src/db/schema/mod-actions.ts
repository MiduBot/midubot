import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const modActionsTable = sqliteTable("mod_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  actionType: text("action_type").notNull(),
  executorId: text("executor_id"),
  targetUserId: text("target_user_id").notNull(),
  reason: text("reason"),
  detail: text("detail"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
