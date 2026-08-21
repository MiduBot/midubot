CREATE TABLE `ai_chat_feedback` (
	`request_message_id` text PRIMARY KEY NOT NULL,
	`response_message_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`requester_id` text NOT NULL,
	`model` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`finish_reason` text NOT NULL,
	`rating` text,
	`rated_by` text,
	`rated_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_chat_feedback_response_message_unq` ON `ai_chat_feedback` (`response_message_id`);--> statement-breakpoint
ALTER TABLE `ai_chat_config` ADD `mode` text DEFAULT 'ambient' NOT NULL;