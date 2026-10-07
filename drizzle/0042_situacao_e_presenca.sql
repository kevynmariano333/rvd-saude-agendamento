ALTER TABLE `users` ADD `situacao` enum('disponivel','ocupado','ausente') DEFAULT 'disponivel' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `vistoEm` timestamp;