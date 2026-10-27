-- TikTok's documented publish ID contains '~' and '.'. Treat it as opaque.
-- Additive correction: previously applied migration 486 remains immutable.
BEGIN;
ALTER TABLE social_post_target_attempts DROP CONSTRAINT social_post_target_attempts_publish_id_check;
ALTER TABLE social_post_target_attempts ADD CONSTRAINT social_post_target_attempts_publish_id_check
  CHECK (publish_id IS NULL OR (char_length(publish_id) BETWEEN 1 AND 64 AND publish_id !~ '[[:space:][:cntrl:]]'));
COMMIT;
