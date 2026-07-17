-- 257_measurement_destination_connection_tenant.sql
-- Preserve the client ownership of any social connection reused by a
-- Measurement destination. Application checks remain defense-in-depth.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_connections_client_id_id
  ON social_connections (client_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conversion_destinations_social_connection_tenant'
      AND conrelid = 'conversion_destinations'::regclass
  ) THEN
    ALTER TABLE conversion_destinations
      ADD CONSTRAINT fk_conversion_destinations_social_connection_tenant
      FOREIGN KEY (client_id, social_connection_id)
      REFERENCES social_connections (client_id, id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE conversion_destinations
  VALIDATE CONSTRAINT fk_conversion_destinations_social_connection_tenant;

COMMENT ON CONSTRAINT fk_conversion_destinations_social_connection_tenant
  ON conversion_destinations IS
  'A reused provider connection must remain owned by the destination client.';

COMMIT;
