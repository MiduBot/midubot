UPDATE `mod_actions` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';--> statement-breakpoint
UPDATE `mod_notes` SET `created_at` = unixepoch(`created_at`) WHERE typeof(`created_at`) = 'text';--> statement-breakpoint
DROP INDEX IF EXISTS "unique_channels_guild_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "unique_messages_guild_user";--> statement-breakpoint
DROP INDEX IF EXISTS "link_cd_guild_channel_uniq";--> statement-breakpoint
DROP INDEX IF EXISTS "link_cd_same_lookup_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "link_cd_any_count_idx";--> statement-breakpoint
ALTER TABLE `mod_actions` ALTER COLUMN "created_at" TO "created_at" integer NOT NULL DEFAULT (unixepoch());--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `unique_channels_guild_id_unique` ON `unique_channels` (`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `unique_messages_guild_user` ON `unique_messages` (`guild_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `link_cd_guild_channel_uniq` ON `link_cooldown_channels` (`guild_id`,`channel_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `link_cd_same_lookup_idx` ON `link_cooldown_entries` (`guild_id`,`channel_id`,`user_id`,`url_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `link_cd_any_count_idx` ON `link_cooldown_entries` (`guild_id`,`channel_id`,`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `mod_notes` ALTER COLUMN "created_at" TO "created_at" integer NOT NULL DEFAULT (unixepoch());
