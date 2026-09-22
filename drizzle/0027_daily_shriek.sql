CREATE TABLE `appointmentInternalNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointmentId` int NOT NULL,
	`authorId` int,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appointmentInternalNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD `quotationNumber` varchar(60);--> statement-breakpoint
ALTER TABLE `appointments` ADD `memorizedOrder` varchar(60);--> statement-breakpoint
ALTER TABLE `appointments` ADD `hisEntryDocument` varchar(60);--> statement-breakpoint
ALTER TABLE `appointments` ADD `hisExitDocument` varchar(60);--> statement-breakpoint
ALTER TABLE `appointments` ADD `backlogReason` varchar(500);--> statement-breakpoint
ALTER TABLE `appointments` ADD `treatedAt` datetime;--> statement-breakpoint
ALTER TABLE `appointments` ADD `treatedById` int;--> statement-breakpoint
ALTER TABLE `appointmentInternalNotes` ADD CONSTRAINT `appointmentInternalNotes_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointmentInternalNotes` ADD CONSTRAINT `appointmentInternalNotes_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointment_internal_notes_idx` ON `appointmentInternalNotes` (`appointmentId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_treatedById_users_id_fk` FOREIGN KEY (`treatedById`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;