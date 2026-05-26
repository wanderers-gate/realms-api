CREATE TABLE `canvas_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`canvas_id` text NOT NULL,
	`op_id` text NOT NULL,
	`type` text NOT NULL,
	`tool` text NOT NULL,
	`points` text NOT NULL,
	`color` text NOT NULL,
	`size` real NOT NULL,
	`user_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`canvas_id`) REFERENCES `canvases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canvas_operations_op_id_unique` ON `canvas_operations` (`op_id`);--> statement-breakpoint
CREATE TABLE `canvases` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`last_modified` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canvases_room_id_unique` ON `canvases` (`room_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`message` text NOT NULL,
	`dice_roll` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`room_code` text NOT NULL,
	`created_by_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`max_players` integer DEFAULT 10,
	`current_players` integer DEFAULT 0 NOT NULL,
	`last_activity` integer,
	`is_private` integer DEFAULT false NOT NULL,
	`allow_guests` integer DEFAULT true NOT NULL,
	`grid_size` integer DEFAULT 50,
	`grid_visible` integer DEFAULT true,
	`grid_type` text DEFAULT 'square',
	`snap_to_grid` integer DEFAULT false,
	`grid_opacity` real DEFAULT 0.6,
	`canvas_width` integer DEFAULT 3000,
	`canvas_height` integer DEFAULT 2000,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_name_unique` ON `rooms` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_slug_unique` ON `rooms` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_room_code_unique` ON `rooms` (`room_code`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text NOT NULL,
	`room_id` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`color` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`owner_id` text NOT NULL,
	`owner_ids` text NOT NULL,
	`image_url` text,
	`visible` integer DEFAULT true NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_token_id_unique` ON `tokens` (`token_id`);--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`can_modify_drawings` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_permission_room_user` ON `user_permissions` (`room_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`display_name` text,
	`token_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);