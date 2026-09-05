CREATE TABLE IF NOT EXISTS `api_source_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`batch` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_api_source_batches_workspace` ON `api_source_batches` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crm_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`plan` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_crm_sync_workspace` ON `crm_sync_runs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `signal_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`batch` text NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_signal_batches_workspace` ON `signal_batches` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `table_transfer_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`receipt` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_table_transfer_runs_source` ON `table_transfer_runs` (`source_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`records` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_webhook_events_workspace` ON `webhook_events` (`workspace_id`,`received_at`,`id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webhook_imports` (
	`event_id` text PRIMARY KEY NOT NULL,
	`imported_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workbook_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`template` text NOT NULL,
	`created_at` integer NOT NULL
);
