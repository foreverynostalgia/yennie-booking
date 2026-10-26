CREATE TABLE `learning_exam_links` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lesson_no` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `learning_exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_exam_link_unique` ON `learning_exam_links` (`exam_id`,`course_id`,`lesson_no`);--> statement-breakpoint
DROP INDEX `learning_attempt_once`;--> statement-breakpoint
ALTER TABLE `learning_attempts` ADD `link_id` text REFERENCES learning_exam_links(id);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_attempt_link_once` ON `learning_attempts` (`link_id`,`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_attempt_once` ON `learning_attempts` (`exam_id`,`student_id`) WHERE "learning_attempts"."link_id" IS NULL;