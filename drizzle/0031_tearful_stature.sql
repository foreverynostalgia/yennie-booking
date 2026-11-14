CREATE TABLE `homework_submission_history` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`student_id` text NOT NULL,
	`file_ids` text NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `homework_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `homework_history_files_unique` ON `homework_submission_history` (`task_id`,`student_id`,`file_ids`);
--> statement-breakpoint
INSERT OR IGNORE INTO homework_submission_history(id,task_id,student_id,file_ids,submitted_at)
SELECT 'legacy:'||task_id||':'||student_id,task_id,student_id,file_ids,updated_at FROM homework_submissions;
