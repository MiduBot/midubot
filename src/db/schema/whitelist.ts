import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const whitelistsTable = sqliteTable("whitelists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  type: text("type", { enum: ["role", "member", "permission"] }).notNull(),
  entityId: text("entity_id").notNull(),
});
