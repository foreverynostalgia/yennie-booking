ALTER TABLE `bookings` ADD `time_start` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `time_end` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `schedules` text DEFAULT '[]' NOT NULL;