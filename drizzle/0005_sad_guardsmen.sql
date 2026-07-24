CREATE TABLE `link_cooldown_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`mode` text DEFAULT 'same' NOT NULL,
	`max_links` integer DEFAULT 1 NOT NULL,
	`window_ms` integer DEFAULT 86400000 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `link_cd_guild_channel_uniq` ON `link_cooldown_channels` (`guild_id`,`channel_id`);--> statement-breakpoint
CREATE TABLE `link_cooldown_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`url_hash` text NOT NULL,
	`url` text NOT NULL,
	`message_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `link_cd_same_lookup_idx` ON `link_cooldown_entries` (`guild_id`,`channel_id`,`user_id`,`url_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `link_cd_any_count_idx` ON `link_cooldown_entries` (`guild_id`,`channel_id`,`user_id`,`created_at`);