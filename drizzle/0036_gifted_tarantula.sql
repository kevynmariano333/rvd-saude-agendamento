CREATE TABLE `systemAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(50) NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`detail` varchar(500),
	CONSTRAINT `systemAlerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `system_alerts_kind_idx` ON `systemAlerts` (`kind`,`sentAt`);