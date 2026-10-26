CREATE TABLE `learning_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`student_id` text NOT NULL,
	`answers` text NOT NULL,
	`grading` text NOT NULL,
	`score` integer NOT NULL,
	`pending` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `learning_exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_attempt_once` ON `learning_attempts` (`exam_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `learning_contacts` (
	`student_id` text PRIMARY KEY NOT NULL,
	`student_phone` text,
	`parent_phone` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `learning_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`request_id` text NOT NULL,
	`status` text NOT NULL,
	`details` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_deliveries_request_id_unique` ON `learning_deliveries` (`request_id`);--> statement-breakpoint
CREATE TABLE `learning_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`questions` text NOT NULL,
	`student_ids` text NOT NULL,
	`paper_key` text,
	`published` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `learning_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`student_ids` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `learning_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`payload` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_reports_token_hash_unique` ON `learning_reports` (`token_hash`);