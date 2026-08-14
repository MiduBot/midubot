CREATE TABLE `ai_chat_config` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`channel_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
