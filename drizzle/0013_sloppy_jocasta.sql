CREATE TABLE `bot_instance` (
	`id` integer PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`claimed_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
