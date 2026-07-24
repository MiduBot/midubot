import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const imagesTable = sqliteTable("images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  hash: text("hash").notNull(),
  phash: text("phash"),
  ahash: text("ahash"),
  colorSig: text("color_sig"),
  width: integer("width"),
  height: integer("height"),
  url: text("url").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
