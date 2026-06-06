CREATE TABLE `character_sheets` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL REFERENCES `rooms`(`id`) ON DELETE CASCADE,
  `owner_id` text NOT NULL,
  `token_id` text,
  `system_id` text NOT NULL,
  `name` text NOT NULL,
  `is_npc` integer NOT NULL DEFAULT 0,
  `portrait_url` text,
  `sheet_data` text NOT NULL DEFAULT '{}',
  `created_at` integer,
  `updated_at` integer
);
