ALTER TABLE `appointmentMessages` ADD `editadaEm` timestamp;
--> statement-breakpoint
CREATE TABLE `appointmentMessageVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`body` text NOT NULL,
	`trocadaEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appointmentMessageVersions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointmentMessageVersions` ADD CONSTRAINT `appointmentMessageVersions_messageId_appointmentMessages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `appointmentMessages`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `appointment_message_versions_idx` ON `appointmentMessageVersions` (`messageId`,`trocadaEm`);
