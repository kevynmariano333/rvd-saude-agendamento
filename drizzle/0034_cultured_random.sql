CREATE TABLE `backupRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`origin` varchar(20) NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`storageKey` varchar(512),
	`rowCount` int,
	`sizeBytes` int,
	`error` varchar(500),
	CONSTRAINT `backupRuns_id` PRIMARY KEY(`id`)
);
