CREATE TABLE `appointmentSuggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointmentId` int NOT NULL,
	`supplierId` int NOT NULL,
	`suggestedFor` datetime NOT NULL,
	`notes` text,
	`status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`handledBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	CONSTRAINT `appointmentSuggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointmentSuggestions` ADD CONSTRAINT `appointmentSuggestions_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointmentSuggestions` ADD CONSTRAINT `appointmentSuggestions_supplierId_users_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointmentSuggestions` ADD CONSTRAINT `appointmentSuggestions_handledBy_users_id_fk` FOREIGN KEY (`handledBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointment_suggestions_appointment_idx` ON `appointmentSuggestions` (`appointmentId`,`status`);--> statement-breakpoint
CREATE INDEX `appointment_suggestions_supplier_idx` ON `appointmentSuggestions` (`supplierId`,`createdAt`);