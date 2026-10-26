CREATE TABLE `student_login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`name` text NOT NULL,
	`school` text NOT NULL,
	`grade` text NOT NULL,
	`phone` text NOT NULL,
	`pin_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_nickname_unique` ON `students` (`nickname`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `student_id` text REFERENCES students(id);