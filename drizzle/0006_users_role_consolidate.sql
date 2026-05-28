PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP INDEX IF EXISTS `users_username_unique`;--> statement-breakpoint
CREATE TABLE `users_new` (
  `id` text PRIMARY KEY,
  `username` text NOT NULL,
  `password` text,
  `display_name` text,
  `role` text NOT NULL DEFAULT 'gm',
  `token_version` integer NOT NULL DEFAULT 0,
  `created_at` integer,
  `updated_at` integer
);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users_new` (`username`);--> statement-breakpoint
INSERT INTO `users_new` (`id`, `username`, `password`, `display_name`, `role`, `token_version`, `created_at`, `updated_at`)
  SELECT `id`, `username`, `password`, `display_name`, 'gm', `token_version`, `created_at`, `updated_at` FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `users_new` RENAME TO `users`;--> statement-breakpoint
DROP TABLE `room_players`;--> statement-breakpoint
DROP TABLE `players`;--> statement-breakpoint
CREATE TABLE `room_players` (
  `id` text PRIMARY KEY,
  `room_id` text NOT NULL REFERENCES `rooms`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `joined_at` integer
);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_room_player` ON `room_players` (`room_id`, `user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
