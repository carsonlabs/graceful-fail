CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`keyPrefix` varchar(16) NOT NULL,
	`keyHash` varchar(64) NOT NULL,
	`tier` enum('hobby','pro','agency') NOT NULL DEFAULT 'hobby',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_keyHash_unique` UNIQUE(`keyHash`)
);
--> statement-breakpoint
CREATE TABLE `request_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`apiKeyId` int NOT NULL,
	`userId` int NOT NULL,
	`destinationUrl` text NOT NULL,
	`method` varchar(16) NOT NULL,
	`statusCode` int NOT NULL,
	`wasIntercepted` boolean NOT NULL DEFAULT false,
	`creditsUsed` int NOT NULL DEFAULT 0,
	`durationMs` int NOT NULL DEFAULT 0,
	`errorSummary` text,
	`isRetriable` boolean,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `request_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usage_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apiKeyId` int NOT NULL,
	`userId` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`totalRequests` int NOT NULL DEFAULT 0,
	`interceptedRequests` int NOT NULL DEFAULT 0,
	`creditsUsed` int NOT NULL DEFAULT 0,
	CONSTRAINT `usage_stats_id` PRIMARY KEY(`id`)
);
