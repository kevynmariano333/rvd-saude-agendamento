CREATE TABLE `purchaseOrderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseOrder` varchar(20) NOT NULL,
	`item` varchar(10) NOT NULL,
	`sapCode` varchar(40),
	`description` varchar(255),
	`recipientCnpj` varchar(20),
	`supplierCode` varchar(40),
	`supplierName` varchar(255),
	`orderedQuantity` decimal(14,3),
	`pendingQuantity` decimal(14,3),
	`unitPriceCents` int,
	`totalCents` int,
	`documentDate` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`missingSince` timestamp,
	CONSTRAINT `purchaseOrderItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_order_items_unique` UNIQUE(`purchaseOrder`,`item`)
);
--> statement-breakpoint
CREATE INDEX `purchase_order_items_order_idx` ON `purchaseOrderItems` (`purchaseOrder`);--> statement-breakpoint
CREATE INDEX `purchase_order_items_sap_idx` ON `purchaseOrderItems` (`sapCode`);