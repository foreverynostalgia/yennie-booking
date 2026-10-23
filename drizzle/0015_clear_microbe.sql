ALTER TABLE `reservation_blocks` ADD `scope_mode` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservation_blocks` ADD `course_ids` text DEFAULT '[]' NOT NULL;