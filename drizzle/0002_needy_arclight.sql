ALTER TABLE `bookings` ADD `notification_status` text DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `notification_message_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `notification_error` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `notification_attempted_at` text;