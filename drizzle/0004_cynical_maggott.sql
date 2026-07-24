ALTER TABLE `guild_configs` ADD `line_filter_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `line_filter_threshold` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `line_filter_risk_limit` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `line_filter_exempt_channels` text DEFAULT '[]' NOT NULL;