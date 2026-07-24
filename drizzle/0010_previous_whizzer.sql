ALTER TABLE `ai_mod_cases` ADD `feedback_action` text;--> statement-breakpoint
ALTER TABLE `ai_mod_cases` ADD `prompt_pending` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_mod_cases` ADD `prompt_error` text;