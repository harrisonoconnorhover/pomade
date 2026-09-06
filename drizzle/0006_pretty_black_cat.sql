CREATE TABLE `research_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`settings` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `research_companion` ADD `models` text;--> statement-breakpoint
ALTER TABLE `research_companion` ADD `models_updated_at` integer;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `reasoning_effort` text;