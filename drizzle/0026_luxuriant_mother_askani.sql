CREATE TABLE `review_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`course_ids` text DEFAULT '[]' NOT NULL,
	`student_ids` text DEFAULT '[]' NOT NULL,
	`lesson_no` integer,
	`published` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
