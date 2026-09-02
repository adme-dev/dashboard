-- Deterministic Google Ads operating-account bindings for measurement reads.
-- Provider-neutral schema only: client-specific bindings live in later,
-- independently reviewable migrations.

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

COMMIT;
