CREATE TABLE `homework_files` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`student_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`committed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `homework_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `homework_push` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `homework_push_endpoint_unique` ON `homework_push` (`endpoint`);--> statement-breakpoint
CREATE TABLE `homework_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `homework_submissions` (
	`task_id` text NOT NULL,
	`student_id` text NOT NULL,
	`file_ids` text NOT NULL,
	`submitted_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`override` text,
	FOREIGN KEY (`task_id`) REFERENCES `homework_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `homework_submission_unique` ON `homework_submissions` (`task_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `homework_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`class_name` text NOT NULL,
	`session_end` text NOT NULL,
	`next_start` text NOT NULL,
	`student_ids` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
