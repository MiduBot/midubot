CREATE TABLE `moderation_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idempotency_key` text NOT NULL,
	`run_id` integer NOT NULL,
	`target_id` integer NOT NULL,
	`action_type` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `moderation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `moderation_targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_actions_key_unq` ON `moderation_actions` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `moderation_digest_state` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`last_sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moderation_feature_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`feature` text NOT NULL,
	`mode` text DEFAULT 'shadow' NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_feature_configs_guild_feature_unq` ON `moderation_feature_configs` (`guild_id`,`feature`);--> statement-breakpoint
CREATE TABLE `moderation_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_id` integer NOT NULL,
	`guild_id` text NOT NULL,
	`feature` text NOT NULL,
	`action` text NOT NULL,
	`expected_label` text,
	`reason` text,
	`reviewer_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `moderation_targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_feedback_target_unq` ON `moderation_feedback` (`target_id`);--> statement-breakpoint
CREATE INDEX `moderation_feedback_guild_feature_created_idx` ON `moderation_feedback` (`guild_id`,`feature`,`created_at`);--> statement-breakpoint
CREATE TABLE `moderation_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`feature` text NOT NULL,
	`mode` text NOT NULL,
	`trigger_message_id` text NOT NULL,
	`reporter_id` text,
	`report_content` text,
	`primary_status` text NOT NULL,
	`primary_output` text,
	`primary_error` text,
	`primary_model` text,
	`primary_prompt_version` text NOT NULL,
	`primary_latency_ms` integer,
	`primary_input_tokens` integer,
	`primary_output_tokens` integer,
	`judge_status` text NOT NULL,
	`judge_output` text,
	`judge_error` text,
	`judge_model` text,
	`judge_prompt_version` text NOT NULL,
	`judge_latency_ms` integer,
	`judge_input_tokens` integer,
	`judge_output_tokens` integer,
	`final_kind` text NOT NULL,
	`decision_reason` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moderation_runs_guild_created_idx` ON `moderation_runs` (`guild_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `moderation_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`candidate_index` integer NOT NULL,
	`guild_id` text NOT NULL,
	`message_id` text NOT NULL,
	`author_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`content` text NOT NULL,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`final_label` text,
	`action` text DEFAULT 'none' NOT NULL,
	`action_status` text DEFAULT 'pending' NOT NULL,
	`audited` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `moderation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_targets_run_candidate_unq` ON `moderation_targets` (`run_id`,`candidate_index`);--> statement-breakpoint
CREATE INDEX `moderation_targets_guild_expires_idx` ON `moderation_targets` (`guild_id`,`expires_at`);--> statement-breakpoint
ALTER TABLE `ai_mod_cases` ADD `moderation_target_id` integer;--> statement-breakpoint
ALTER TABLE `job_guard_cases` ADD `moderation_target_id` integer;