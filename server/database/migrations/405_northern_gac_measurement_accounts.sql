-- Deterministic Google Ads operating-account bindings for measurement reads.
-- The canonical client remains the tenancy boundary; aliases select an exact
-- account within that client and never imply group aggregation.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_client_aliases_client_id_id
  ON agency_client_aliases(client_id, id);

CREATE TABLE IF NOT EXISTS google_ads_account_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  alias_id UUID,
  connection_id UUID NOT NULL,
  operating_customer_id TEXT NOT NULL CHECK (operating_customer_id ~ '^[0-9]{1,20}$'),
  login_customer_id TEXT CHECK (login_customer_id IS NULL OR login_customer_id ~ '^[0-9]{1,20}$'),
  account_role TEXT NOT NULL CHECK (account_role IN (
    'dealer', 'brand', 'group', 'reporting_only', 'default_measurement'
  )),
  created_by TEXT NOT NULL DEFAULT 'migration',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, connection_id),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, alias_id)
    REFERENCES agency_client_aliases(client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, connection_id)
    REFERENCES social_connections(client_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_ads_account_bindings_alias
  ON google_ads_account_bindings(client_id, alias_id)
  WHERE alias_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_ads_account_bindings_canonical_role
  ON google_ads_account_bindings(client_id, account_role)
  WHERE alias_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_google_ads_account_bindings_customer
  ON google_ads_account_bindings(operating_customer_id, client_id);

CREATE TABLE IF NOT EXISTS google_ads_account_binding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id UUID NOT NULL,
  client_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('seeded', 'created', 'updated', 'disabled')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('team_member', 'system', 'migration')),
  actor_id TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, binding_id)
    REFERENCES google_ads_account_bindings(client_id, id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE OR REPLACE FUNCTION prevent_google_ads_account_binding_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'google_ads_account_binding_events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS google_ads_account_binding_events_append_only
  ON google_ads_account_binding_events;
CREATE TRIGGER google_ads_account_binding_events_append_only
  BEFORE UPDATE OR DELETE ON google_ads_account_binding_events
  FOR EACH ROW EXECUTE FUNCTION prevent_google_ads_account_binding_event_mutation();

DO $$
DECLARE
  pilot_issue TEXT;
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM agency_clients
       WHERE id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
         AND LOWER(name) = LOWER('Northern Motor Group')
    ) THEN 'canonical client missing or mismatched'
    WHEN NOT EXISTS (
      SELECT 1 FROM agency_client_aliases
       WHERE client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
         AND LOWER(alias) = LOWER('Northern GAC')
    ) THEN 'Northern GAC alias missing or mismatched'
    WHEN NOT EXISTS (
      SELECT 1 FROM social_connections
       WHERE id = '717f209a-b2ea-4f2e-b489-2034a16ae9c1'::uuid
         AND client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
         AND platform = 'google'
         AND status = 'active'
         AND REGEXP_REPLACE(account_id, '[^0-9]', '', 'g') = '7583977544'
    ) THEN 'Northern GAC Google connection missing or mismatched'
    WHEN NOT EXISTS (
      SELECT 1 FROM social_connections
       WHERE id = '9e32b563-a2c7-4e44-b703-1223260abd4b'::uuid
         AND client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
         AND platform = 'google'
         AND status = 'active'
         AND REGEXP_REPLACE(account_id, '[^0-9]', '', 'g') = '6692975433'
    ) THEN 'Northern Motor Group Google connection missing or mismatched'
    ELSE NULL
  END INTO pilot_issue;

  IF pilot_issue IS NOT NULL THEN
    RAISE EXCEPTION 'Northern measurement-account seed failed: %', pilot_issue;
  END IF;
END
$$;

WITH pilot_bindings(alias_name, connection_id, operating_customer_id, account_role) AS (
  VALUES
    ('Northern GAC', '717f209a-b2ea-4f2e-b489-2034a16ae9c1'::uuid, '7583977544', 'dealer'),
    ('Northern Motor Group', '9e32b563-a2c7-4e44-b703-1223260abd4b'::uuid, '6692975433', 'group')
), resolved AS (
  SELECT
    'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid AS client_id,
    CASE WHEN p.alias_name = 'Northern GAC' THEN a.id ELSE NULL END AS alias_id,
    p.connection_id,
    p.operating_customer_id,
    p.account_role
  FROM pilot_bindings p
  LEFT JOIN agency_client_aliases a
    ON a.client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
   AND LOWER(a.alias) = LOWER(p.alias_name)
)
INSERT INTO google_ads_account_bindings (
  client_id, alias_id, connection_id, operating_customer_id, account_role, created_by
)
SELECT client_id, alias_id, connection_id, operating_customer_id, account_role, 'migration:405'
FROM resolved
ON CONFLICT (client_id, connection_id) DO UPDATE SET
  alias_id = EXCLUDED.alias_id,
  operating_customer_id = EXCLUDED.operating_customer_id,
  account_role = EXCLUDED.account_role,
  updated_at = NOW();

INSERT INTO google_ads_account_binding_events (
  binding_id, client_id, event_type, actor_type, actor_id, evidence
)
SELECT b.id, b.client_id, 'seeded', 'migration', '405', jsonb_build_object(
  'connectionId', b.connection_id,
  'operatingCustomerId', b.operating_customer_id,
  'accountRole', b.account_role
)
FROM google_ads_account_bindings b
WHERE b.client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
  AND b.connection_id IN (
    '717f209a-b2ea-4f2e-b489-2034a16ae9c1'::uuid,
    '9e32b563-a2c7-4e44-b703-1223260abd4b'::uuid
  )
  AND NOT EXISTS (
    SELECT 1 FROM google_ads_account_binding_events e
     WHERE e.binding_id = b.id
       AND e.event_type = 'seeded'
       AND e.actor_id = '405'
  );

COMMIT;
