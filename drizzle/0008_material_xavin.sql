CREATE TABLE `ai_mod_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`author_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`content` text NOT NULL,
	`verdict` integer NOT NULL,
	`confidence` real NOT NULL,
	`platform` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`action_taken` text,
	`resolved` integer DEFAULT false NOT NULL,
	`resolved_by` text,
	`resolved_action` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_mod_ignored_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`target_id` text NOT NULL,
	`target_type` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_mod_ignored_channels_guild_target_unq` ON `ai_mod_ignored_channels` (`guild_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `ai_mod_malicious_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`content` text NOT NULL,
	`malicious` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_mod_malicious_messages_guild_content_unq` ON `ai_mod_malicious_messages` (`guild_id`,`content`);--> statement-breakpoint
CREATE TABLE `ai_mod_mod_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_mod_mod_roles_guild_role_unq` ON `ai_mod_mod_roles` (`guild_id`,`role_id`);--> statement-breakpoint
CREATE TABLE `ai_mod_notify_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`target_id` text NOT NULL,
	`target_type` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_mod_notify_targets_guild_target_unq` ON `ai_mod_notify_targets` (`guild_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `ai_mod_ai_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`prompt` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_mod_selfpromo_bypass_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_mod_selfpromo_bypass_guild_channel_unq` ON `ai_mod_selfpromo_bypass_channels` (`guild_id`,`channel_id`);--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `ai_mod_enabled` integer DEFAULT false NOT NULL;