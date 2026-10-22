ALTER TABLE `users` ADD `empresasOperadas` varchar(30);
--> statement-breakpoint
-- Quem já opera hoje atende a Amil, que era a única empresa do portal. O
-- IS NULL protege uma reaplicação: nunca reescreve a escolha de quem já foi
-- movido para a RVD ou para a LLT.
UPDATE `users` SET `empresasOperadas` = 'amil' WHERE `empresasOperadas` IS NULL AND `role` IN ('operator', 'planejador', 'planejador_leitura');
