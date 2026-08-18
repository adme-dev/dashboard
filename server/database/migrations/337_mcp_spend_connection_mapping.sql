BEGIN;

-- A connection-level client assignment is authoritative unless a campaign has
-- an explicit legacy override. Older sync jobs ignored this column, leaving
-- correctly configured accounts in the MCP's unattributed spend bucket.
UPDATE media_spend AS ms
SET client_id = sc.client_id,
    updated_at = NOW()
FROM social_connections AS sc
WHERE ms.connection_id = sc.id
  AND ms.client_id IS NULL
  AND sc.client_id IS NOT NULL;

COMMIT;
