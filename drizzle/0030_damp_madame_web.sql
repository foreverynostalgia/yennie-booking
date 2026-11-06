CREATE TABLE `review_class_assignments` (
	`class_id` text PRIMARY KEY NOT NULL,
	`class_name` text NOT NULL,
	`review_course_ids` text NOT NULL,
	`student_ids` text NOT NULL,
	`updated_at` text NOT NULL
);
