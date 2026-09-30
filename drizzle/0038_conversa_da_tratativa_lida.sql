-- Até onde cada pessoa já leu a conversa da tratativa de uma nota.
--
-- O aviso do sino não tinha como parar de aparecer: a anotação interna é lida
-- por todo o balcão, e "lida" não cabe numa coluna da própria anotação — ela
-- seria lida por um e continuaria nova para os outros. Uma linha por pessoa e
-- por nota responde isso sem tocar no que já está gravado.
CREATE TABLE `appointmentInternalNoteReads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `appointmentId` int NOT NULL,
  `lastReadAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `appointmentInternalNoteReads_id` PRIMARY KEY(`id`),
  CONSTRAINT `appointment_internal_note_reads_unq` UNIQUE(`userId`,`appointmentId`)
);
--> statement-breakpoint
ALTER TABLE `appointmentInternalNoteReads` ADD CONSTRAINT `appointmentInternalNoteReads_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `appointmentInternalNoteReads` ADD CONSTRAINT `appointmentInternalNoteReads_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;
