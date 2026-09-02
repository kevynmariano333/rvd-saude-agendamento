CREATE TABLE `docks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` int NOT NULL,
	`status` enum('disponivel','indisponivel') NOT NULL DEFAULT 'disponivel',
	`reason` varchar(255),
	`updatedById` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `docks_id` PRIMARY KEY(`id`),
	CONSTRAINT `docks_number_unique` UNIQUE(`number`)
);
--> statement-breakpoint
ALTER TABLE `docks` ADD CONSTRAINT `docks_updatedById_users_id_fk` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT IGNORE INTO `docks` (`number`, `status`) VALUES (1, 'disponivel'), (2, 'disponivel');
