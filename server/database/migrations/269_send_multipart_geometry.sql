BEGIN;

ALTER TABLE send_upload_intents
  ADD COLUMN IF NOT EXISTS multipart_part_size_bytes BIGINT;

ALTER TABLE send_upload_intents
  DROP CONSTRAINT IF EXISTS send_upload_intents_multipart_geometry_check;

ALTER TABLE send_upload_intents
  ADD CONSTRAINT send_upload_intents_multipart_geometry_check CHECK (
    (upload_method = 'single' AND multipart_part_size_bytes IS NULL)
    OR (
      upload_method = 'multipart'
      AND multipart_part_size_bytes BETWEEN 5242880 AND 5368709120
      AND expected_size_bytes <= multipart_part_size_bytes * 10000
    )
  );

COMMENT ON COLUMN send_upload_intents.multipart_part_size_bytes IS
  'Server-owned R2 multipart geometry. Clients receive the size/count but never select the object key or multipart upload ID.';

COMMIT;
