CREATE TABLE `reservation_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text,
	`date` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
