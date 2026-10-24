-- Denial-only foundation. No recovery admission or original business-row changes.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_heads (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_intents(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  recovery_id UUID NOT NULL UNIQUE,
  epoch INTEGER NOT NULL CHECK(epoch BETWEEN 1 AND 2147483646),
  mode TEXT NOT NULL CHECK(mode IN ('reconciling','approved','pending','applied','revoked')),
  cas_version INTEGER NOT NULL CHECK(cas_version BETWEEN 1 AND 2147483646),
  review_revision INTEGER,
  review_digest TEXT,
  reconciliation_digest TEXT,
  admission_id UUID,
  d1_prepared_digest TEXT,
  applied_grant_digest TEXT,
  CHECK(review_revision IS NULL AND review_digest IS NULL AND reconciliation_digest IS NULL
    AND admission_id IS NULL AND d1_prepared_digest IS NULL AND applied_grant_digest IS NULL),
  deadline TIMESTAMPTZ NOT NULL CHECK(isfinite(deadline)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(deadline>created_at)
);
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_events (
  operation_id UUID NOT NULL REFERENCES page_studio_transfer_recovery_heads(operation_id),
  cas_version INTEGER NOT NULL,
  recovery_id UUID NOT NULL,
  epoch INTEGER NOT NULL,
  mode TEXT NOT NULL,
  intent_digest TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(operation_id,cas_version)
);
CREATE OR REPLACE FUNCTION page_studio_transfer_recovery_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE retained_digest TEXT; retained_site UUID;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Recovery head is retained'; END IF;
  SELECT intent_digest,site_id INTO retained_digest,retained_site
    FROM page_studio_managed_transfer_intents WHERE operation_id=NEW.operation_id;
  IF retained_digest IS NULL OR retained_digest<>NEW.intent_digest THEN RAISE EXCEPTION 'Recovery original intent mismatch'; END IF;
  -- Same site lock as original transfer authority. A close cannot commit across
  -- an already admitted SQL consumer; its caller must positively reconcile it.
  PERFORM id FROM page_studio_sites WHERE id=retained_site FOR NO KEY UPDATE NOWAIT;
  IF TG_OP='INSERT' OR NEW.recovery_id IS DISTINCT FROM OLD.recovery_id THEN
    IF EXISTS(SELECT 1 FROM page_studio_transfer_recovery_events WHERE recovery_id=NEW.recovery_id)
      THEN RAISE EXCEPTION 'Recovery identity cannot be reused'; END IF;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.epoch<>1 OR NEW.cas_version<>1 OR NEW.mode<>'reconciling'
      OR NEW.deadline<=clock_timestamp() THEN RAISE EXCEPTION 'Recovery must begin closed'; END IF;
    NEW.created_at:=clock_timestamp();
  ELSE
    IF ROW(NEW.operation_id,NEW.intent_digest,NEW.created_at) IS DISTINCT FROM ROW(OLD.operation_id,OLD.intent_digest,OLD.created_at)
      OR NEW.cas_version::bigint<>OLD.cas_version::bigint+1 THEN RAISE EXCEPTION 'Recovery identity or CAS mismatch'; END IF;
    IF OLD.mode='reconciling' AND NEW.mode='revoked' THEN
      IF ROW(NEW.epoch,NEW.recovery_id,NEW.deadline) IS DISTINCT FROM ROW(OLD.epoch,OLD.recovery_id,OLD.deadline)
        THEN RAISE EXCEPTION 'Recovery revocation identity mismatch'; END IF;
    ELSIF OLD.mode='revoked' AND NEW.mode='reconciling' THEN
      IF NEW.epoch::bigint<>OLD.epoch::bigint+1 OR NEW.recovery_id=OLD.recovery_id OR NEW.deadline<=clock_timestamp()
        THEN RAISE EXCEPTION 'Recovery next epoch mismatch'; END IF;
    ELSE
      -- Approval/admission needs the later reviewed consent/plan/cross-store
      -- protocol. Merely writing these selector modes must never enable it.
      RAISE EXCEPTION 'Recovery admission is not implemented';
    END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION page_studio_transfer_recovery_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' OR pg_trigger_depth()<>2 THEN RAISE EXCEPTION 'Recovery history is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION page_studio_transfer_recovery_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO page_studio_transfer_recovery_events(operation_id,cas_version,recovery_id,epoch,mode,intent_digest,deadline)
    VALUES(NEW.operation_id,NEW.cas_version,NEW.recovery_id,NEW.epoch,NEW.mode,NEW.intent_digest,NEW.deadline);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_transfer_recovery_head_guard ON page_studio_transfer_recovery_heads;
CREATE TRIGGER page_studio_transfer_recovery_head_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_transfer_recovery_heads
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_recovery_head_guard();
DROP TRIGGER IF EXISTS page_studio_transfer_recovery_history_guard ON page_studio_transfer_recovery_events;
CREATE TRIGGER page_studio_transfer_recovery_history_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_transfer_recovery_events
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_recovery_history_guard();
DROP TRIGGER IF EXISTS page_studio_transfer_recovery_record ON page_studio_transfer_recovery_heads;
CREATE TRIGGER page_studio_transfer_recovery_record AFTER INSERT OR UPDATE ON page_studio_transfer_recovery_heads
  FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_recovery_record();
COMMIT;
