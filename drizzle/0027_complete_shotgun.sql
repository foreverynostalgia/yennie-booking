CREATE TABLE `review_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`student_id` text NOT NULL,
	`version` integer NOT NULL,
	`duration` real NOT NULL,
	`coverage` text DEFAULT '[]' NOT NULL,
	`watched_seconds` real DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`session_id` text NOT NULL,
	`last_at` integer NOT NULL,
	`last_position` real DEFAULT 0 NOT NULL,
	`playing` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `review_videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_progress_unique` ON `review_progress` (`video_id`,`student_id`,`version`);--> statement-breakpoint
CREATE TABLE `review_quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`student_id` text NOT NULL,
	`version` integer NOT NULL,
	`attempt_no` integer NOT NULL,
	`answers` text NOT NULL,
	`grading` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `review_videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_quiz_attempt_unique` ON `review_quiz_attempts` (`video_id`,`student_id`,`version`,`attempt_no`);--> statement-breakpoint
ALTER TABLE `review_videos` ADD `curriculum_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_videos` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_videos` ADD `quiz` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_videos` ADD `version` integer DEFAULT 1 NOT NULL;