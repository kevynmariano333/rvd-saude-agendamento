CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`serviceType` varchar(80) NOT NULL,
	`scheduledFor` datetime NOT NULL,
	`notes` text,
	`status` enum('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
	`handledBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','operator','supplier') NOT NULL DEFAULT 'supplier';--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_supplierId_users_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_handledBy_users_id_fk` FOREIGN KEY (`handledBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointments_supplier_status_idx` ON `appointments` (`supplierId`,`status`);--> statement-breakpoint
CREATE INDEX `appointments_schedule_idx` ON `appointments` (`scheduledFor`);