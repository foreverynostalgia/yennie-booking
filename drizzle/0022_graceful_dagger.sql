CREATE TABLE `learning_ocr_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`source_key` text NOT NULL,
	`request_id` text,
	`status` text NOT NULL,
	`draft` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_ocr_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key_encrypted` text NOT NULL,
	`updated_at` text NOT NULL
);
