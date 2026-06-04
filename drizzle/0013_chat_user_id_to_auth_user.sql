-- Clears chat_messages so user_id can be repurposed to store the authenticated
-- user's DB id (users.id) instead of the ephemeral socket id.
-- Safe in development; in production a more careful backfill would be needed.
DELETE FROM `chat_messages`;
