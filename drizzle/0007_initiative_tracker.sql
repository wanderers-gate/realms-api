CREATE TABLE `initiative_trackers` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL UNIQUE REFERENCES `rooms`(`id`),
	`state` text NOT NULL DEFAULT '{}',
	`created_at` integer,
	`updated_at` integer
);
