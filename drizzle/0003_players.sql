CREATE TABLE `players` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `password_hash` text,
  `created_at` integer,
  `updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_username_unique` ON `players` (`username`);
--> statement-breakpoint
CREATE TABLE `room_players` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL REFERENCES `rooms`(`id`),
  `player_id` text NOT NULL REFERENCES `players`(`id`),
  `joined_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_room_player` ON `room_players` (`room_id`, `player_id`);
