ALTER TABLE `bookings` ADD `attendance` text DEFAULT 'unmarked' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `attendance_updated_at` text;