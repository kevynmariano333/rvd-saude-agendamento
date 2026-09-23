CREATE INDEX `appointments_status_schedule_idx` ON `appointments` (`status`,`scheduledFor`);--> statement-breakpoint
CREATE INDEX `appointments_invoice_supplier_cnpj_idx` ON `appointments` (`invoiceSupplierCnpj`);--> statement-breakpoint
CREATE INDEX `appointments_recipient_cnpj_idx` ON `appointments` (`recipientCnpj`);--> statement-breakpoint
CREATE INDEX `appointments_invoice_number_idx` ON `appointments` (`invoiceNumber`);--> statement-breakpoint
CREATE INDEX `appointments_source_idx` ON `appointments` (`source`);