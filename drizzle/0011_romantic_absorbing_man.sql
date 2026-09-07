ALTER TABLE `run_jobs` ADD `schedule_execution_id` text;--> statement-breakpoint
ALTER TABLE `run_jobs` ADD `next_check_at` integer;--> statement-breakpoint
ALTER TABLE `run_jobs` ADD `waiting_message` text;