BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM agency_clients
    WHERE id = '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid
      AND LOWER(name) = LOWER('Frankston Motor Group')
  ) THEN
    RAISE EXCEPTION 'Frankston Motor Group canonical client is missing or mismatched';
  END IF;
END
$$;

INSERT INTO agency_client_aliases (client_id, alias, source)
VALUES (
  '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid,
  'Frankston Nissan',
  'catalogue_feed_registration'
)
ON CONFLICT (LOWER(alias)) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  source = EXCLUDED.source,
  updated_at = NOW();

COMMIT;
