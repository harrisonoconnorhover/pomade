CREATE TABLE `waterfall_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`execution_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
