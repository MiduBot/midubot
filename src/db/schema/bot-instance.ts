import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** Single-row lock: the newest ready instance owns the Discord session. */
export const botInstanceTable = sqliteTable("bot_instance", {
  id: integer("id").primaryKey(),
  instanceId: text("instance_id").notNull(),
  claimedAt: integer("claimed_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
