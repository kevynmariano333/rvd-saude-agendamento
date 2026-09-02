ALTER TABLE `attendances` RENAME COLUMN `carrier` TO `supplierName`;--> statement-breakpoint
ALTER TABLE `attendances` MODIFY COLUMN `supplierName` varchar(160);