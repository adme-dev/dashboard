-- Forward-only hardening for Task 3 endpoint mutations and routing presets.
-- The audit payloads intentionally hold only operator-safe endpoint metadata.

BEGIN;

ALTER TABLE lead_rule_destinations
  ADD COLUMN IF NOT EXISTS preset_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_rule_destinations_preset_key
  ON lead_rule_destinations (rule_id, preset_key)
  WHERE preset_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS lead_email_endpoint_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES lead_email_endpoints(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL DEFAULT 'team_member'
    CHECK (actor_type = 'team_member'),
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'enabled', 'disabled', 'retired', 'rotated')),
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(before_state) = 'object'),
  CHECK (jsonb_typeof(after_state) = 'object'),
  CHECK (NOT (before_state ?| ARRAY[
    'address_token', 'previous_address_token', 'email_address', 'allowed_sender_domains'
  ])),
  CHECK (NOT (after_state ?| ARRAY[
    'address_token', 'previous_address_token', 'email_address', 'allowed_sender_domains'
  ]))
);

CREATE INDEX IF NOT EXISTS idx_lead_email_endpoint_audits_endpoint_created
  ON lead_email_endpoint_audits (endpoint_id, created_at DESC, id DESC);

COMMIT;
