CREATE TABLE `guild_configs` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`language` text DEFAULT 'es' NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whitelists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`type` text NOT NULL,
	`entity_id` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `images_hash_unique`;--> statement-breakpoint
ALTER TABLE `images` ADD `guild_id` text NOT NULL;