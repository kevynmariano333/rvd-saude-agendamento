ALTER TABLE `appointmentMessages` ADD `apagadaEm` timestamp;
--> statement-breakpoint
ALTER TABLE `appointmentMessages` ADD `apagadaPor` int;
--> statement-breakpoint
ALTER TABLE `appointmentMessages` ADD CONSTRAINT `appointmentMessages_apagadaPor_users_id_fk` FOREIGN KEY (`apagadaPor`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
