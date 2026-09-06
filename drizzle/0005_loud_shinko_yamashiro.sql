CREATE TABLE `research_companion` (
	`id` integer PRIMARY KEY NOT NULL,
	`ready` integer NOT NULL,
	`browser_available` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`model` text,
	`browser` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_research_requests_status_created` ON `research_requests` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `run_jobs` ADD `resume_column_ids` text;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS workspace_revision_guard
BEFORE UPDATE ON workspaces
WHEN COALESCE(json_extract(NEW.snapshot, '$.revision'), 0) != COALESCE(json_extract(OLD.snapshot, '$.revision'), 0) + 1
BEGIN SELECT RAISE(ABORT, 'Workspace changed; reload before retrying.'); END;
