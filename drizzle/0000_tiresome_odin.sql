CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`school` text NOT NULL,
	`grade` text NOT NULL,
	`phone` text NOT NULL,
	`access_code` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` text NOT NULL,
	`cancel_requested_at` text,
	`cancelled_at` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`day` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`capacity` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
