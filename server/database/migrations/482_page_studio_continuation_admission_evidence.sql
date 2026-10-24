-- Immutable native admission bytes, not provider authority. The caller must use
-- the native transition verifier and final current-authority fence separately.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_continuation_admission_evidence (
  operation_id UUID NOT NULL,
  continuation_id UUID NOT NULL,
  event_id UUID NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('prepare','enable','revoke')),
  kind TEXT NOT NULL CHECK(kind IN ('planned','observed')),
  journal_sequence INTEGER NOT NULL,
  journal_digest TEXT NOT NULL CHECK(journal_digest ~ '^[a-f0-9]{64}$'),
  grant_digest TEXT NOT NULL CHECK(grant_digest ~ '^[a-f0-9]{64}$'),
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  previous_digest TEXT NOT NULL CHECK(previous_digest ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
  payload_json TEXT NOT NULL CHECK(octet_length(payload_json)<=131100 AND payload_json::jsonb=payload),
  digest TEXT NOT NULL UNIQUE CHECK(digest ~ '^[a-f0-9]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(event_id,kind),
  UNIQUE(continuation_id,action,kind),
  FOREIGN KEY(operation_id,journal_sequence) REFERENCES page_studio_transfer_recovery_continuations(operation_id,sequence)
);
CREATE OR REPLACE FUNCTION page_studio_continuation_admission_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE site UUID; canonical_entry TEXT;
  cursor_row page_studio_transfer_recovery_continuations%ROWTYPE;
  grant_row page_studio_transfer_recovery_continuations%ROWTYPE;
  planned page_studio_continuation_admission_evidence%ROWTYPE;
  request JSONB; previous JSONB; result JSONB;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Continuation admission evidence is immutable'; END IF;
  SELECT site_id INTO site FROM page_studio_managed_transfer_intents WHERE operation_id=NEW.operation_id;
  IF site IS NULL THEN RAISE EXCEPTION 'Original continuation site unavailable'; END IF;
  PERFORM id FROM page_studio_sites WHERE id=site FOR NO KEY UPDATE NOWAIT;
  SELECT * INTO cursor_row FROM page_studio_transfer_recovery_continuations
    WHERE operation_id=NEW.operation_id AND sequence=NEW.journal_sequence;
  IF cursor_row.digest IS DISTINCT FROM NEW.journal_digest THEN RAISE EXCEPTION 'Admission cursor changed'; END IF;
  canonical_entry:='{"action":'||to_json(NEW.action)::text||',"continuationId":'||to_json(NEW.continuation_id::text)::text
    ||',"cursor":{"digest":'||to_json(NEW.journal_digest)::text||',"sequence":'||NEW.journal_sequence::text||'}'
    ||',"eventId":'||to_json(NEW.event_id::text)::text||',"grantDigest":'||to_json(NEW.grant_digest)::text
    ||',"kind":'||to_json(NEW.kind)::text||',"operationId":'||to_json(NEW.operation_id::text)::text
    ||',"payload":'||NEW.payload_json||',"previousDigest":'||to_json(NEW.previous_digest)::text
    ||',"requestDigest":'||to_json(NEW.request_digest)::text||'}';
  IF encode(sha256(convert_to(canonical_entry,'UTF8')),'hex') IS DISTINCT FROM NEW.digest THEN
    RAISE EXCEPTION 'Admission evidence digest changed'; END IF;
  IF NEW.kind='planned' THEN
    request:=NEW.payload->'request'; previous:=NEW.payload->'previous';
    IF NOT (NEW.payload ?& ARRAY['request','previous'] AND NEW.payload-ARRAY['request','previous']='{}'::jsonb
      AND jsonb_typeof(request)='object' AND jsonb_typeof(previous)='object') IS TRUE
      OR request->>'purpose' IS DISTINCT FROM 'recovery-continuation-admission'
      OR request->>'formatVersion' IS DISTINCT FROM '1' OR request->>'action' IS DISTINCT FROM NEW.action
      OR request->>'eventId' IS DISTINCT FROM NEW.event_id::text
      OR request->>'previousHeadDigest' IS DISTINCT FROM NEW.previous_digest
      OR previous->>'operationId' IS DISTINCT FROM NEW.operation_id::text
      OR request->'expectedVersion' IS DISTINCT FROM previous->'version'
      OR request->'grant'->>'operationId' IS DISTINCT FROM NEW.operation_id::text
      OR request->'grant'->>'continuationId' IS DISTINCT FROM NEW.continuation_id::text THEN
      RAISE EXCEPTION 'Admission planned identity changed'; END IF;
    SELECT * INTO grant_row FROM page_studio_transfer_recovery_continuations
      WHERE operation_id=NEW.operation_id AND kind='grant' ORDER BY sequence DESC LIMIT 1;
    IF grant_row.entry_id IS NULL OR grant_row.body IS DISTINCT FROM request->'grant'
      OR encode(sha256(convert_to(grant_row.body_json,'UTF8')),'hex') IS DISTINCT FROM NEW.grant_digest
      OR previous->>'intentDigest' IS DISTINCT FROM grant_row.body->>'intentDigest'
      OR NEW.journal_sequence IS DISTINCT FROM (SELECT max(sequence) FROM page_studio_transfer_recovery_continuations WHERE operation_id=NEW.operation_id)
      OR (NEW.action<>'revoke' AND NOT ((grant_row.body->>'deadline')::timestamptz>clock_timestamp()) IS TRUE)
      OR NOT (CASE NEW.action
        WHEN 'prepare' THEN cursor_row.kind='grant'
        WHEN 'enable' THEN cursor_row.kind='admission' AND cursor_row.body->>'step'='applied'
        WHEN 'revoke' THEN cursor_row.kind<>'revocation' ELSE FALSE END) IS TRUE THEN
      RAISE EXCEPTION 'Admission grant or current cursor changed'; END IF;
  ELSE
    result:=NEW.payload->'result';
    SELECT * INTO planned FROM page_studio_continuation_admission_evidence WHERE event_id=NEW.event_id AND kind='planned';
    IF planned.event_id IS NULL
      OR ROW(NEW.operation_id,NEW.continuation_id,NEW.action,NEW.journal_sequence,NEW.journal_digest,NEW.grant_digest,NEW.request_digest,NEW.previous_digest)
        IS DISTINCT FROM ROW(planned.operation_id,planned.continuation_id,planned.action,planned.journal_sequence,planned.journal_digest,planned.grant_digest,planned.request_digest,planned.previous_digest)
      OR NOT (NEW.payload ? 'result' AND NEW.payload-'result'='{}'::jsonb AND jsonb_typeof(result)='object') IS TRUE
      OR result->>'operationId' IS DISTINCT FROM NEW.operation_id::text OR result->>'grantDigest' IS DISTINCT FROM NEW.grant_digest
      OR result->>'intentDigest' IS DISTINCT FROM planned.payload->'previous'->>'intentDigest'
      OR (result->>'version')::integer IS DISTINCT FROM (planned.payload->'request'->>'expectedVersion')::integer+1
      OR result->>'mode' IS DISTINCT FROM (CASE NEW.action WHEN 'prepare' THEN 'prepared' WHEN 'enable' THEN 'enabled' WHEN 'revoke' THEN 'revoked' END) THEN
      RAISE EXCEPTION 'Admission observation lacks exact planned evidence'; END IF;
  END IF;
  NEW.recorded_at:=clock_timestamp();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_continuation_admission_evidence_guard ON page_studio_continuation_admission_evidence;
CREATE TRIGGER page_studio_continuation_admission_evidence_guard BEFORE INSERT OR UPDATE OR DELETE
  ON page_studio_continuation_admission_evidence FOR EACH ROW EXECUTE FUNCTION page_studio_continuation_admission_evidence_guard();
COMMIT;
