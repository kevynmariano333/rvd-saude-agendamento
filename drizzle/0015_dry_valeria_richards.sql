ALTER TABLE `users` DROP INDEX `users_company_cnpj_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `accessStatus` enum('approved','pending','rejected') DEFAULT 'approved' NOT NULL;--> statement-breakpoint
CREATE INDEX `users_company_cnpj_idx` ON `users` (`companyCnpj`);