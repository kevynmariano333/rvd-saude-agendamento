CREATE TABLE `appointmentMessageReads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`appointmentId` int NOT NULL,
	`lastReadMessageId` int NOT NULL DEFAULT 0,
	CONSTRAINT `appointmentMessageReads_id` PRIMARY KEY(`id`),
	CONSTRAINT `appointment_message_reads_unq` UNIQUE(`userId`,`appointmentId`)
);
--> statement-breakpoint
ALTER TABLE `appointmentMessageReads` ADD CONSTRAINT `appointmentMessageReads_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointmentMessageReads` ADD CONSTRAINT `appointmentMessageReads_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Preserva o que cada pessoa já tinha lido. Sem isto, o histórico inteiro das
-- conversas voltaria vermelho para todo mundo no dia do deploy.
--
-- A regra antiga era uma leitura por casa, guardada na própria mensagem. A
-- aproximação: a última mensagem que a casa leu marca como lido tudo o que veio
-- antes dela. Daí em diante a leitura é exata, por pessoa.
INSERT INTO `appointmentMessageReads` (`userId`, `appointmentId`, `lastReadMessageId`)
SELECT u.`id`, m.`appointmentId`, MAX(m.`id`)
FROM `users` u
INNER JOIN `appointmentMessages` m ON m.`operatorReadAt` IS NOT NULL
WHERE u.`role` IN ('operator', 'admin', 'planejador', 'planejador_leitura')
GROUP BY u.`id`, m.`appointmentId`;--> statement-breakpoint
INSERT INTO `appointmentMessageReads` (`userId`, `appointmentId`, `lastReadMessageId`)
SELECT u.`id`, m.`appointmentId`, MAX(m.`id`)
FROM `users` u
INNER JOIN `appointments` a ON a.`supplierId` = u.`id`
INNER JOIN `appointmentMessages` m ON m.`appointmentId` = a.`id` AND m.`supplierReadAt` IS NOT NULL
WHERE u.`role` = 'supplier'
GROUP BY u.`id`, m.`appointmentId`;--> statement-breakpoint
ALTER TABLE `appointmentMessages` DROP COLUMN `operatorReadAt`;--> statement-breakpoint
ALTER TABLE `appointmentMessages` DROP COLUMN `supplierReadAt`;