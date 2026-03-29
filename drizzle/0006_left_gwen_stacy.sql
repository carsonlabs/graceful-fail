CREATE TABLE `sentry_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`webhookSecret` varchar(64) NOT NULL,
	`projectSlug` varchar(128),
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sentry_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `sentry_integrations_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `request_logs` ADD `wasAutoRetried` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `request_logs` ADD `retrySucceeded` boolean;--> statement-breakpoint
ALTER TABLE `request_logs` ADD `retryStatusCode` int;--> statement-breakpoint
ALTER TABLE `request_logs` ADD `source` varchar(32) DEFAULT 'proxy';