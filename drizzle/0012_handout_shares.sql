CREATE TABLE `handout_shares` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL REFERENCES `rooms`(`id`) ON DELETE CASCADE,
  `image_url` text NOT NULL,
  `is_shared` integer NOT NULL DEFAULT 1,
  `created_at` integer,
  `updated_at` integer,
  CONSTRAINT `uq_handout_share` UNIQUE(`room_id`, `image_url`)
);
