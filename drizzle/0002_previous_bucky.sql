CREATE TABLE `appointmentStatusHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointmentId` int NOT NULL,
	`previousStatus` enum('pending','approved','rejected','completed'),
	`nextStatus` enum('pending','approved','rejected','completed') NOT NULL,
	`handledBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appointmentStatusHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointmentStatusHistory` ADD CONSTRAINT `appointmentStatusHistory_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointmentStatusHistory` ADD CONSTRAINT `appointmentStatusHistory_handledBy_users_id_fk` FOREIGN KEY (`handledBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointment_status_history_idx` ON `appointmentStatusHistory` (`appointmentId`,`createdAt`);