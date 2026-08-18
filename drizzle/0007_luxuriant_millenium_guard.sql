ALTER TABLE `appointmentStatusHistory` ADD `eventNote` text;--> statement-breakpoint
ALTER TABLE `appointments` ADD `rejectionReason` text;--> statement-breakpoint
ALTER TABLE `appointments` ADD `purchaseOrder` varchar(100);