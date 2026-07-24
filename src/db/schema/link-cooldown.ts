import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const linkCooldownChannelsTable = sqliteTable(
  "link_cooldown_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    mode: text("mode", { enum: ["same", "any"] }).notNull().default("same"),
    maxLinks: integer("max_links").notNull().default(1),
    windowMs: integer("window_ms").notNull().default(86400000),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    guildChannelUniq: uniqueIndex("link_cd_guild_channel_uniq").on(
      t.guildId,
      t.channelId,
    ),
  }),
);

export const linkCooldownEntriesTable = sqliteTable(
  "link_cooldown_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    userId: text("user_id").notNull(),
    urlHash: text("url_hash").notNull(),
    url: text("url").notNull(),
    messageId: text("message_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    sameLookup: index("link_cd_same_lookup_idx").on(
      t.guildId,
      t.channelId,
      t.userId,
      t.urlHash,
      t.createdAt,
    ),
    anyCount: index("link_cd_any_count_idx").on(
      t.guildId,
      t.channelId,
      t.userId,
      t.createdAt,
    ),
  }),
);
