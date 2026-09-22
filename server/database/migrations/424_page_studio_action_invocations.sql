-- Explicit native metadata installation only. No private bytes or execution grants.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_action_invocations (
  scope_key TEXT NOT NULL,
  intent_id UUID NOT NULL,
  invocation_id UUID NOT NULL UNIQUE,
  claim_id UUID NOT NULL UNIQUE,
  broker_id TEXT NOT NULL CHECK (length(broker_id) BETWEEN 1 AND 128),
  identity_digest TEXT NOT NULL CHECK (identity_digest ~ '^[a-f0-9]{64}$'),
  identity JSONB NOT NULL,
  execution JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'dispatch_claimed' CHECK (state IN ('dispatch_claimed','result_ready','execution_failed','committed','rejected')),
  result_pin JSONB,
  result_digest TEXT CHECK (result_digest ~ '^[a-f0-9]{64}$'),
  final_receipt JSONB,
  effect_identity JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(scope_key,intent_id),
  CHECK ((state='dispatch_claimed' AND result_pin IS NULL AND result_digest IS NULL)
    OR (state<>'dispatch_claimed' AND result_pin IS NOT NULL AND result_digest IS NOT NULL)),
  CHECK ((state='committed') = (final_receipt IS NOT NULL))
);
CREATE OR REPLACE FUNCTION page_studio_action_invocation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ACTION_INVOCATION_IMMUTABLE'; END IF;
  IF ROW(NEW.scope_key,NEW.intent_id,NEW.invocation_id,NEW.claim_id,NEW.broker_id,NEW.identity_digest,NEW.identity,NEW.execution,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.scope_key,OLD.intent_id,OLD.invocation_id,OLD.claim_id,OLD.broker_id,OLD.identity_digest,OLD.identity,OLD.execution,OLD.created_at)
    OR (OLD.result_pin IS NOT NULL AND ROW(NEW.result_pin,NEW.result_digest) IS DISTINCT FROM ROW(OLD.result_pin,OLD.result_digest))
    OR (OLD.effect_identity IS NOT NULL AND NEW.effect_identity IS DISTINCT FROM OLD.effect_identity)
    OR (OLD.final_receipt IS NOT NULL AND NEW.final_receipt IS DISTINCT FROM OLD.final_receipt)
    OR NOT (NEW.state=OLD.state OR (OLD.state='dispatch_claimed' AND NEW.state IN ('result_ready','execution_failed')) OR (OLD.state='result_ready' AND NEW.state IN ('committed','rejected'))) THEN
    RAISE EXCEPTION 'ACTION_INVOCATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_action_invocation_immutable ON page_studio_action_invocations;
CREATE TRIGGER page_studio_action_invocation_immutable BEFORE UPDATE OR DELETE ON page_studio_action_invocations FOR EACH ROW EXECUTE FUNCTION page_studio_action_invocation_immutable();
COMMIT;
