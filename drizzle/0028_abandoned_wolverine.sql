CREATE TABLE `review_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_courses_title_unique` ON `review_courses` (`title`);--> statement-breakpoint
ALTER TABLE `review_videos` ADD `review_course_id` text REFERENCES review_courses(id);