CREATE TABLE `crm_refreshes` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`status` text NOT NULL,
	`next_run_at` integer,
	`lease_until` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_crm_refreshes_due` ON `crm_refreshes` (`status`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `workbook_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workbook_id` text NOT NULL,
	`status` text NOT NULL,
	`state` text NOT NULL,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_workbook_runs_workbook_created` ON `workbook_runs` (`workbook_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workbook_runs_active` ON `workbook_runs` (`workbook_id`) WHERE "workbook_runs"."status" IN ('running','paused','needs_attention');--> statement-breakpoint
ALTER TABLE `run_jobs` ADD `workbook_run_id` text;