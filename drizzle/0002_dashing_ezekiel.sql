CREATE TABLE `run_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`status` text NOT NULL,
	`row_ids` text NOT NULL,
	`column_ids` text,
	`cursor` integer DEFAULT 0 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`confirm_external_research` integer DEFAULT false NOT NULL,
	`lease_until` integer,
	`last_run_id` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_run_jobs_workspace_created` ON `run_jobs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_run_jobs_status_updated` ON `run_jobs` (`status`,`updated_at`);