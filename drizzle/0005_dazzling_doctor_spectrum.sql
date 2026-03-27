CREATE TABLE `slack_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`webhookUrl` text NOT NULL,
	`channel` varchar(128),
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `slack_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `slack_integrations_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `request_logs` ADD `provider` varchar(32);--> statement-breakpoint
ALTER TABLE `request_logs` ADD `errorCategory` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `weeklyDigestEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastDigestSentAt` timestamp;