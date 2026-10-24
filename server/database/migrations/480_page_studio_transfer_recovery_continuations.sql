-- Append-only causal storage. This table does not authorize provider work.
-- Versioned consent/current-authority and typed physical-receipt checks remain
-- required in the private controller; no public caller is introduced here.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_transfer_recovery_continuations (
  operation_id UUID NOT NULL REFERENCES page_studio_managed_transfer_intents(operation_id),
  sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 128),
  entry_id UUID NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('grant','admission','phase','revocation')),
  previous_digest TEXT CHECK(previous_digest ~ '^[a-f0-9]{64}$'),
  body JSONB NOT NULL CHECK(jsonb_typeof(body)='object'),
  body_json TEXT NOT NULL CHECK(octet_length(body_json)<=32768 AND body_json::jsonb=body),
  digest TEXT NOT NULL UNIQUE CHECK(digest ~ '^[a-f0-9]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(operation_id,sequence),
  CHECK((sequence=1)=(previous_digest IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS page_studio_continuation_identity_unique
  ON page_studio_transfer_recovery_continuations ((body->>'continuationId')) WHERE kind='grant';
CREATE OR REPLACE FUNCTION page_studio_transfer_continuation_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  site UUID; intent_digest TEXT; canonical_entry TEXT;
  prior page_studio_transfer_recovery_continuations%ROWTYPE;
  grant_row page_studio_transfer_recovery_continuations%ROWTYPE;
  control_row page_studio_transfer_recovery_continuations%ROWTYPE;
  progress_digest TEXT; grant_digest TEXT; phase_name TEXT; action_name TEXT; required_keys TEXT[]; key TEXT;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Continuation journal is immutable'; END IF;
  required_keys:=CASE NEW.kind
    WHEN 'grant' THEN ARRAY['formatVersion','kind','operationId','intentDigest','continuationId','predecessor','reviewDigest','ownerConsentDigest','operatorConsentDigest','authorityDigest','descriptorDigest','progressDigest','allowedThrough','issuedAt','deadline']
    WHEN 'admission' THEN ARRAY['continuationId','grantDigest','step','receiptDigest']
    WHEN 'phase' THEN ARRAY['continuationId','grantDigest','phase','action','outcome','envelopeDigest','receiptDigest','requestDigest','resultDigest','effects','beforeProgressDigest','afterProgressDigest']
    WHEN 'revocation' THEN ARRAY['continuationId','grantDigest','reason','authorityDigest'] ELSE NULL END;
  IF required_keys IS NULL OR NOT (NEW.body ?& required_keys) OR NEW.body-required_keys<>'{}'::jsonb
    OR NOT (jsonb_typeof(NEW.body->'continuationId')='string' AND NEW.body->>'continuationId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') IS TRUE THEN
    RAISE EXCEPTION 'Continuation body shape mismatch'; END IF;
  FOREACH key IN ARRAY required_keys LOOP
    IF key LIKE '%Digest' AND NOT (jsonb_typeof(NEW.body->key)='string' AND NEW.body->>key ~ '^[a-f0-9]{64}$') IS TRUE THEN
      RAISE EXCEPTION 'Continuation body digest mismatch'; END IF;
  END LOOP;
  IF NEW.kind='phase' THEN
    IF jsonb_typeof(NEW.body->'effects') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid continuation claims'; END IF;
    IF jsonb_array_length(NEW.body->'effects')>32 OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(NEW.body->'effects') claim
      WHERE NOT (jsonb_typeof(claim)='object' AND claim ?& ARRAY['effectKey','claimDigest']
        AND claim-ARRAY['effectKey','claimDigest']='{}'::jsonb
        AND claim->>'effectKey' ~ '^[a-f0-9]{64}$' AND claim->>'claimDigest' ~ '^[a-f0-9]{64}$') IS TRUE)
      OR (SELECT count(DISTINCT claim->>'effectKey') FROM jsonb_array_elements(NEW.body->'effects') claim)<>jsonb_array_length(NEW.body->'effects') THEN
      RAISE EXCEPTION 'Invalid continuation claims'; END IF;
  END IF;
  SELECT i.site_id,i.intent_digest INTO site,intent_digest
    FROM page_studio_managed_transfer_intents i WHERE i.operation_id=NEW.operation_id;
  IF site IS NULL THEN RAISE EXCEPTION 'Original transfer is unavailable'; END IF;
  PERFORM id FROM page_studio_sites WHERE id=site FOR NO KEY UPDATE NOWAIT;
  SELECT * INTO prior FROM page_studio_transfer_recovery_continuations
    WHERE operation_id=NEW.operation_id ORDER BY sequence DESC LIMIT 1;
  IF NEW.sequence<>COALESCE(prior.sequence,0)+1 OR NEW.previous_digest IS DISTINCT FROM prior.digest THEN
    RAISE EXCEPTION 'Continuation cursor changed'; END IF;
  -- Same lexicographic envelope as collectionCanonical. Read-side verification
  -- also requires exact canonical body_json, rather than JSONB equality alone.
  canonical_entry:='{"body":'||NEW.body_json||',"entryId":'||to_json(NEW.entry_id::text)::text
    ||',"kind":'||to_json(NEW.kind)::text||',"operationId":'||to_json(NEW.operation_id::text)::text
    ||',"previousDigest":'||COALESCE(to_json(NEW.previous_digest)::text,'null')||',"sequence":'||NEW.sequence::text||'}';
  IF encode(sha256(convert_to(canonical_entry,'UTF8')),'hex')<>NEW.digest THEN
    RAISE EXCEPTION 'Continuation envelope digest mismatch'; END IF;
  SELECT * INTO grant_row FROM page_studio_transfer_recovery_continuations
    WHERE operation_id=NEW.operation_id AND kind='grant' ORDER BY sequence DESC LIMIT 1;
  IF grant_row.entry_id IS NOT NULL THEN
    grant_digest:=encode(sha256(convert_to(grant_row.body_json,'UTF8')),'hex');
  END IF;
  IF NEW.kind='grant' THEN
    IF NEW.body->>'kind' IS DISTINCT FROM 'managed-transfer-continuation-v1'
      OR NEW.body->>'formatVersion' IS DISTINCT FROM '1'
      OR NEW.body->>'operationId' IS DISTINCT FROM NEW.operation_id::text
      OR NEW.body->>'intentDigest' IS DISTINCT FROM intent_digest
      OR NEW.body->>'allowedThrough' IS DISTINCT FROM 'source-retention'
      OR NEW.body->'predecessor'->>'grantDigest' IS DISTINCT FROM grant_digest
      OR NEW.body->'predecessor'->'journal' IS DISTINCT FROM
        (CASE WHEN prior.entry_id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('sequence',prior.sequence,'digest',prior.digest) END)
      OR (grant_row.entry_id IS NOT NULL AND NEW.body->'predecessor'->>'originalRecoveryHeadDigest'
        IS DISTINCT FROM grant_row.body->'predecessor'->>'originalRecoveryHeadDigest')
      OR NOT ((NEW.body->>'deadline')::timestamptz>clock_timestamp()
        AND (NEW.body->>'issuedAt')::timestamptz<=clock_timestamp()
        AND (NEW.body->>'deadline')::timestamptz>(NEW.body->>'issuedAt')::timestamptz
        AND (NEW.body->>'deadline')::timestamptz<=(NEW.body->>'issuedAt')::timestamptz+interval '1 hour') IS TRUE THEN
      RAISE EXCEPTION 'Continuation grant lineage mismatch'; END IF;
  ELSE
    IF grant_row.entry_id IS NULL OR NEW.body->>'continuationId' IS DISTINCT FROM grant_row.body->>'continuationId'
      OR NEW.body->>'grantDigest' IS DISTINCT FROM grant_digest THEN
      RAISE EXCEPTION 'Continuation grant is unavailable'; END IF;
    SELECT * INTO control_row FROM page_studio_transfer_recovery_continuations
      WHERE operation_id=NEW.operation_id AND kind<>'phase' ORDER BY sequence DESC LIMIT 1;
    IF control_row.kind='revocation' THEN RAISE EXCEPTION 'Continuation was revoked'; END IF;
    IF NEW.kind<>'revocation' AND NOT ((grant_row.body->>'deadline')::timestamptz>clock_timestamp()) IS TRUE THEN
      RAISE EXCEPTION 'Continuation expired'; END IF;
    IF NEW.kind='admission' THEN
      IF NEW.body->>'step' IS DISTINCT FROM (CASE
        WHEN control_row.kind='grant' THEN 'prepared'
        WHEN control_row.kind='admission' AND control_row.body->>'step'='prepared' THEN 'applied'
        WHEN control_row.kind='admission' AND control_row.body->>'step'='applied' THEN 'enabled'
        ELSE NULL END) OR NEW.body->>'step' IS NULL THEN
        RAISE EXCEPTION 'Continuation admission order changed'; END IF;
    ELSIF NEW.kind='phase' THEN
      phase_name:=NEW.body->>'phase'; action_name:=NEW.body->>'action';
      progress_digest:=CASE WHEN prior.kind='phase' THEN prior.body->>'afterProgressDigest' ELSE grant_row.body->>'progressDigest' END;
      IF control_row.kind<>'admission' OR control_row.body->>'step' IS DISTINCT FROM 'enabled'
        OR NEW.body->>'beforeProgressDigest' IS DISTINCT FROM progress_digest
        OR NEW.body->>'afterProgressDigest' IS NOT DISTINCT FROM progress_digest
        OR NOT (CASE phase_name
          WHEN 'source-ready' THEN action_name='inspect'
          WHEN 'destination-execution' THEN action_name IN ('prepare','inspect','execute')
          WHEN 'copy' THEN action_name IN ('prepare','inspect','execute')
          WHEN 'forms-history' THEN action_name IN ('prepare','inspect','execute')
          WHEN 'source-freeze' THEN action_name IN ('inspect','execute')
          WHEN 'completion' THEN action_name IN ('inspect','execute')
          WHEN 'destination-authoring' THEN action_name IN ('inspect','execute')
          WHEN 'source-retention' THEN action_name IN ('inspect','execute') ELSE FALSE END) IS TRUE
        OR NEW.body->>'outcome' IS DISTINCT FROM (CASE action_name WHEN 'prepare' THEN 'prepared' WHEN 'inspect' THEN 'verified' WHEN 'execute' THEN 'complete' END)
        OR ((action_name='prepare' OR phase_name='completion') AND NEW.body->'effects' IS DISTINCT FROM '[]'::jsonb)
        OR EXISTS(SELECT 1 FROM page_studio_transfer_recovery_continuations e
          WHERE e.operation_id=NEW.operation_id AND e.kind='phase' AND (
            e.body->>'receiptDigest'=NEW.body->>'receiptDigest' OR e.body->>'envelopeDigest'=NEW.body->>'envelopeDigest'
            OR (e.body->>'phase'=phase_name AND (e.body->>'requestDigest' IS DISTINCT FROM NEW.body->>'requestDigest'
              OR (action_name<>'inspect' AND e.body->>'outcome'='complete')
              OR (action_name='prepare' AND e.body->>'outcome'='prepared'))))) THEN
        RAISE EXCEPTION 'Continuation phase linkage mismatch'; END IF;
    ELSIF NEW.kind='revocation' AND NOT (NEW.body->>'reason' IN ('operator','owner','authority-changed')) IS TRUE THEN
      RAISE EXCEPTION 'Continuation revocation reason mismatch';
    END IF;
  END IF;
  NEW.recorded_at:=clock_timestamp();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_transfer_continuation_journal_guard ON page_studio_transfer_recovery_continuations;
CREATE TRIGGER page_studio_transfer_continuation_journal_guard BEFORE INSERT OR UPDATE OR DELETE
  ON page_studio_transfer_recovery_continuations FOR EACH ROW EXECUTE FUNCTION page_studio_transfer_continuation_journal_guard();
COMMIT;
