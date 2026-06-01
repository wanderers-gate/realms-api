ALTER TABLE `tokens` ADD COLUMN `hp` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `tokens` ADD COLUMN `max_hp` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `tokens` ADD COLUMN `conditions` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `tokens` ADD COLUMN `initiative` integer NOT NULL DEFAULT 0;
