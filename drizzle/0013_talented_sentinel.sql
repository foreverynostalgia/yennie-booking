ALTER TABLE `bookings` ADD `calendar_sync_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `calendar_synced_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `calendar_sync_error` text;