CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripeCustomerId` varchar(64),
	`stripeSubscriptionId` varchar(64),
	`tier` enum('hobby','pro','agency') NOT NULL DEFAULT 'hobby',
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`currentPeriodEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`endpointId` int NOT NULL,
	`event` varchar(64) NOT NULL,
	`payload` text NOT NULL,
	`responseStatusCode` int,
	`attempts` int NOT NULL DEFAULT 0,
	`success` boolean NOT NULL DEFAULT false,
	`lastAttemptAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_endpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`url` text NOT NULL,
	`secret` varchar(64) NOT NULL,
	`events` text NOT NULL DEFAULT ('["all"]'),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_endpoints_id` PRIMARY KEY(`id`)
);
