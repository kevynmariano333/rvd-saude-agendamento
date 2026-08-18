ALTER TABLE `appointments` ADD `source` enum('portal','manual_xml') DEFAULT 'portal' NOT NULL;--> statement-breakpoint
ALTER TABLE `appointments` ADD `xmlStorageKey` varchar(512);--> statement-breakpoint
ALTER TABLE `appointments` ADD `xmlUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `appointments` ADD `xmlFileName` varchar(255);--> statement-breakpoint
ALTER TABLE `appointments` ADD `invoiceNumber` varchar(100);--> statement-breakpoint
ALTER TABLE `appointments` ADD `invoiceAccessKey` varchar(80);--> statement-breakpoint
ALTER TABLE `appointments` ADD `invoiceIssuedAt` datetime;