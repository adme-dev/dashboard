-- Private intent only: no authoring selection, allocation, activation or DNS change.
-- One initial native staging -> production transition per site. Recovery retains
-- this identity; a future cancellation lifecycle must not erase its history.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_intents (
  operation_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL UNIQUE,
  source_scope_key TEXT NOT NULL,
  source_generation UUID NOT NULL,
  destination_generation UUID NOT NULL UNIQUE,
  entitlement_id UUID NOT NULL,
  request JSONB NOT NULL,
  intent JSONB NOT NULL,
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(tenant_id,client_id,site_id) REFERENCES page_studio_sites(tenant_id,client_id,id),
  FOREIGN KEY(tenant_id,client_id,entitlement_id) REFERENCES page_studio_entitlements(tenant_id,client_id,id),
  FOREIGN KEY(source_scope_key,tenant_id,client_id,site_id) REFERENCES page_studio_cms_scopes(scope_key,tenant_id,client_id,site_id),
  CHECK(source_generation<>destination_generation),
  CHECK(octet_length(request::text)<=4096 AND octet_length(intent::text)<=2097152),
  CHECK((jsonb_typeof(request)='object' AND jsonb_typeof(intent)='object'
    AND request->>'operationId'=operation_id::text AND intent->>'operationId'=operation_id::text
    AND request->>'expectedSourceDigest'=intent->>'sourceDigest'
    AND intent->>'formatVersion'='1'
    AND intent->'source'->'context'->'state'->>'scope_key'=source_scope_key
    AND intent->'source'->'context'->'state'->>'active_generation'=source_generation::text
    AND intent->'source'->'context'->'state'->>'environment'='staging'
    AND intent->'destination'->>'environment'='production'
    AND intent->'destination'->>'generation'=destination_generation::text
    AND intent->'destination'->>'requestKey'='transfer_' || operation_id::text
    AND intent->'authority'->>'entitlementId'=entitlement_id::text) IS TRUE)
);
CREATE OR REPLACE FUNCTION page_studio_managed_transfer_intent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Managed transfer intent is immutable'; END $$;
DROP TRIGGER IF EXISTS page_studio_managed_transfer_intent_immutable ON page_studio_managed_transfer_intents;
CREATE TRIGGER page_studio_managed_transfer_intent_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_intents
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;
