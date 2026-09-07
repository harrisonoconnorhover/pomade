CREATE TABLE `account_credentials` (
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`payload` text NOT NULL,
	`label` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `pomade_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_credentials_account_provider` ON `account_credentials` (`account_id`,`provider`);--> statement-breakpoint
CREATE TABLE `pomade_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`subject` text,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`data_prefix` text NOT NULL,
	`schema_version` integer DEFAULT 0 NOT NULL,
	`vault_migrated` integer DEFAULT 0 NOT NULL,
	`companion_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pomade_accounts_email_unique` ON `pomade_accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `pomade_accounts_subject_unique` ON `pomade_accounts` (`subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `pomade_accounts_data_prefix_unique` ON `pomade_accounts` (`data_prefix`);--> statement-breakpoint
CREATE UNIQUE INDEX `pomade_accounts_companion_hash_unique` ON `pomade_accounts` (`companion_hash`);