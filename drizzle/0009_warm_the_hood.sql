ALTER TABLE `appointments` ADD `preNoteConfirmedAt` datetime;--> statement-breakpoint
ALTER TABLE `appointments` ADD `preNoteConfirmedBy` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_preNoteConfirmedBy_users_id_fk` FOREIGN KEY (`preNoteConfirmedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;