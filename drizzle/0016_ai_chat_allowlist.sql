CREATE TABLE `ai_chat_allowlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`type` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_chat_allowlist_guild_type_entity_unq` ON `ai_chat_allowlist` (`guild_id`,`type`,`entity_id`);