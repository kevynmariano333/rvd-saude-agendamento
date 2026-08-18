CREATE TABLE `appointmentMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointmentId` int NOT NULL,
	`senderId` int NOT NULL,
	`body` text NOT NULL,
	`operatorReadAt` datetime,
	`supplierReadAt` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appointmentMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointmentMessages` ADD CONSTRAINT `appointmentMessages_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointmentMessages` ADD CONSTRAINT `appointmentMessages_senderId_users_id_fk` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointment_messages_appointment_idx` ON `appointmentMessages` (`appointmentId`,`createdAt`);