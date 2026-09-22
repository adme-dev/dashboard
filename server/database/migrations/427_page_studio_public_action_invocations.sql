-- Explicit installation before enabling public actions. Each immutable public
-- dispatch claim also reserves one unit from the existing client AI allowance.
-- There is no human actor/session and no expiry that could authorize redispatch.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_public_action_invocations (
  scope_key TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  business_id UUID NOT NULL CHECK (business_id = client_id),
  site_id UUID NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  release_environment TEXT NOT NULL CHECK (release_environment IN ('staging', 'production')),
  intent_id UUID NOT NULL,
  invocation_id UUID NOT NULL UNIQUE,
  claim_id UUID NOT NULL UNIQUE,
  broker_id TEXT NOT NULL CHECK (broker_id = 'page-studio-published-form-host'),
  identity_digest TEXT NOT NULL CHECK (identity_digest ~ '^[a-f0-9]{64}$'),
  identity JSONB NOT NULL CHECK (jsonb_typeof(identity) = 'object'),
  execution JSONB NOT NULL CHECK (jsonb_typeof(execution) = 'object'),
  secret_hash TEXT NOT NULL CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
  challenge_digest TEXT NOT NULL CHECK (challenge_digest ~ '^[a-f0-9]{64}$'),
  release_id UUID NOT NULL,
  activation_id UUID NOT NULL,
  pointer_version BIGINT NOT NULL CHECK (pointer_version BETWEEN 1 AND 9007199254740991),
  entitlement_id UUID NOT NULL,
  period_start DATE NOT NULL CHECK (EXTRACT(DAY FROM period_start) = 1),
  quota_state TEXT NOT NULL DEFAULT 'reserved' CHECK (quota_state IN ('reserved','succeeded','failed')),
  settled_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'dispatch_claimed' CHECK (state IN ('dispatch_claimed','result_ready','execution_failed','committed','rejected')),
  result_pin JSONB CHECK (jsonb_typeof(result_pin) = 'object'),
  result_digest TEXT CHECK (result_digest ~ '^[a-f0-9]{64}$'),
  effect_identity JSONB CHECK (jsonb_typeof(effect_identity) = 'object'),
  final_receipt JSONB CHECK (jsonb_typeof(final_receipt) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(scope_key,release_environment,intent_id),
  FOREIGN KEY (tenant_id,client_id,site_id) REFERENCES page_studio_sites(tenant_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,client_id,entitlement_id) REFERENCES page_studio_entitlements(tenant_id,client_id,id) ON DELETE RESTRICT,
  CHECK ((state='dispatch_claimed' AND quota_state='reserved' AND settled_at IS NULL AND result_pin IS NULL AND result_digest IS NULL)
    OR (state='execution_failed' AND quota_state='failed' AND settled_at IS NOT NULL AND result_pin IS NOT NULL AND result_digest IS NOT NULL)
    OR (state IN ('result_ready','committed','rejected') AND quota_state='succeeded' AND settled_at IS NOT NULL AND result_pin IS NOT NULL AND result_digest IS NOT NULL)),
  CHECK ((state='committed') = (final_receipt IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_page_studio_public_action_usage_period ON page_studio_public_action_invocations(tenant_id,client_id,period_start);
CREATE OR REPLACE FUNCTION page_studio_public_action_invocation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PUBLIC_ACTION_INVOCATION_IMMUTABLE'; END IF;
  IF ROW(NEW.scope_key,NEW.tenant_id,NEW.client_id,NEW.business_id,NEW.site_id,NEW.environment,NEW.release_environment,
      NEW.intent_id,NEW.invocation_id,NEW.claim_id,NEW.broker_id,NEW.identity_digest,NEW.identity,NEW.execution,
      NEW.secret_hash,NEW.challenge_digest,NEW.release_id,NEW.activation_id,NEW.pointer_version,NEW.entitlement_id,NEW.period_start,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.scope_key,OLD.tenant_id,OLD.client_id,OLD.business_id,OLD.site_id,OLD.environment,OLD.release_environment,
      OLD.intent_id,OLD.invocation_id,OLD.claim_id,OLD.broker_id,OLD.identity_digest,OLD.identity,OLD.execution,
      OLD.secret_hash,OLD.challenge_digest,OLD.release_id,OLD.activation_id,OLD.pointer_version,OLD.entitlement_id,OLD.period_start,OLD.created_at)
    OR (OLD.result_pin IS NOT NULL AND ROW(NEW.result_pin,NEW.result_digest) IS DISTINCT FROM ROW(OLD.result_pin,OLD.result_digest))
    OR (OLD.effect_identity IS NOT NULL AND NEW.effect_identity IS DISTINCT FROM OLD.effect_identity)
    OR (OLD.final_receipt IS NOT NULL AND NEW.final_receipt IS DISTINCT FROM OLD.final_receipt)
    OR (OLD.quota_state<>'reserved' AND ROW(NEW.quota_state,NEW.settled_at) IS DISTINCT FROM ROW(OLD.quota_state,OLD.settled_at))
    OR NOT (NEW.state=OLD.state OR (OLD.state='dispatch_claimed' AND NEW.state IN ('result_ready','execution_failed')) OR (OLD.state='result_ready' AND NEW.state IN ('committed','rejected'))) THEN
    RAISE EXCEPTION 'PUBLIC_ACTION_INVOCATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_public_action_invocation_immutable ON page_studio_public_action_invocations;
CREATE TRIGGER page_studio_public_action_invocation_immutable BEFORE UPDATE OR DELETE ON page_studio_public_action_invocations FOR EACH ROW EXECUTE FUNCTION page_studio_public_action_invocation_immutable();
COMMIT;
