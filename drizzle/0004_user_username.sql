ALTER TABLE `users` ADD `username` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
UPDATE `users` SET `username` = `email` WHERE `username` IS NULL;