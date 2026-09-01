CREATE TABLE `attendanceEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendanceId` int NOT NULL,
	`eventType` enum('chegada_registrada','entrada_aprovada','entrada_recusada','atendimento_iniciado','liberacao_registrada','atendimento_concluido') NOT NULL,
	`description` text,
	`performedById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendanceEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`protocol` varchar(32) NOT NULL,
	`driverName` varchar(160) NOT NULL,
	`licensePlate` varchar(12) NOT NULL,
	`carrier` varchar(160) NOT NULL,
	`serviceType` enum('coleta','recebimento') NOT NULL,
	`classification` enum('amil','llt','rvd') NOT NULL,
	`classificationDetail` enum('maternidade','hospital','sedex','mercado_livre','nao_aplicavel') NOT NULL DEFAULT 'nao_aplicavel',
	`status` enum('aguardando','aprovado','recusado','em_atendimento','liberado','concluido') NOT NULL DEFAULT 'aguardando',
	`arrivalAt` timestamp NOT NULL DEFAULT (now()),
	`decisionAt` datetime,
	`releasedAt` datetime,
	`concludedAt` datetime,
	`refusalReason` text,
	`notes` text,
	`createdById` int NOT NULL,
	`decisionById` int,
	`operatedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendances_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendances_protocol_unique` UNIQUE(`protocol`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','operator','supplier','portaria','operacao') NOT NULL DEFAULT 'supplier';--> statement-breakpoint
ALTER TABLE `attendanceEvents` ADD CONSTRAINT `attendanceEvents_attendanceId_attendances_id_fk` FOREIGN KEY (`attendanceId`) REFERENCES `attendances`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceEvents` ADD CONSTRAINT `attendanceEvents_performedById_users_id_fk` FOREIGN KEY (`performedById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_decisionById_users_id_fk` FOREIGN KEY (`decisionById`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_operatedById_users_id_fk` FOREIGN KEY (`operatedById`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_events_attendance_idx` ON `attendanceEvents` (`attendanceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `attendances_status_idx` ON `attendances` (`status`);--> statement-breakpoint
CREATE INDEX `attendances_service_type_idx` ON `attendances` (`serviceType`);--> statement-breakpoint
CREATE INDEX `attendances_arrival_at_idx` ON `attendances` (`arrivalAt`);