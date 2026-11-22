-- Question papers (문제지) can exist before they are given to a class.
-- Additive only: distribution stays in learning_exam_links; papers that are
-- not attached to a class use the hidden "paper-library" course (active=-1,
-- excluded from every course list).
ALTER TABLE `learning_exams` ADD `updated_at` text;
--> statement-breakpoint
ALTER TABLE `learning_exams` ADD `crop_margin` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `courses`(`id`,`title`,`day`,`start`,`end`,`capacity`,`active`) VALUES('paper-library','문제지 보관함',0,'00:00','00:00',0,-1);
