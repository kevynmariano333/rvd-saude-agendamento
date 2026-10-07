CREATE TABLE `feedbacks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`mensagem` varchar(1000) NOT NULL,
	`pagina` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lidoEm` timestamp,
	`lidoPor` int,
	CONSTRAINT `feedbacks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_lidoPor_users_id_fk` FOREIGN KEY (`lidoPor`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `feedbacks_recentes_idx` ON `feedbacks` (`createdAt`);--> statement-breakpoint
CREATE INDEX `feedbacks_nao_lidos_idx` ON `feedbacks` (`lidoEm`,`createdAt`);