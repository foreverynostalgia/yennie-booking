ALTER TABLE `learning_exam_links` ADD `student_ids` text;
--> statement-breakpoint
ALTER TABLE `learning_exam_links` ADD `label` text;
--> statement-breakpoint
ALTER TABLE `learning_exam_links` ADD `class_id` text;
--> statement-breakpoint
ALTER TABLE `learning_exam_links` ADD `session_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_exam_link_session` ON `learning_exam_links` (`class_id`,`session_id`) WHERE `class_id` IS NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `courses`(`id`,`title`,`day`,`start`,`end`,`capacity`,`active`) VALUES('class-sessions','수업 관리 회차',0,'00:00','00:00',0,-1);
--> statement-breakpoint
CREATE TABLE `learning_session_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`session_id` text NOT NULL,
	`title` text NOT NULL,
	`class_name` text NOT NULL,
	`date` text,
	`student_ids` text NOT NULL,
	`payload` text NOT NULL,
	`published_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_session_reports_session` ON `learning_session_reports` (`class_id`,`session_id`);
