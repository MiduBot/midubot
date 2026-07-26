CREATE TABLE `job_guard_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`author_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`content` text NOT NULL,
	`verdict` text NOT NULL,
	`confidence` real NOT NULL,
	`reason` text,
	`deleted` integer DEFAULT false NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`resolved_by` text,
	`resolved_action` text,
	`resolved_at` integer,
	`feedback_action` text,
	`prompt_pending` integer DEFAULT false NOT NULL,
	`prompt_error` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_guard_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`prompt` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
