-- Atomic native authoring handoff. It does not activate a public release or DNS.
BEGIN;
CREATE TABLE page_studio_managed_transfer_completions (
 operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_intents(operation_id),
 intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
 source_scope_key TEXT NOT NULL,source_generation UUID NOT NULL,
 destination_scope_key TEXT NOT NULL,destination_generation UUID NOT NULL,
 copy_proof_digest TEXT NOT NULL CHECK(copy_proof_digest ~ '^[a-f0-9]{64}$'),
 history_receipt_digest TEXT NOT NULL CHECK(history_receipt_digest ~ '^[a-f0-9]{64}$'),
 receipt JSONB NOT NULL,receipt_json TEXT NOT NULL CHECK(octet_length(receipt_json)<=16384),
 receipt_digest TEXT NOT NULL CHECK(receipt_digest ~ '^[a-f0-9]{64}$'),audit_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(operation_id) REFERENCES page_studio_managed_transfer_copy_graph_verifications(operation_id),
 FOREIGN KEY(operation_id) REFERENCES page_studio_managed_transfer_forms_history_verifications(operation_id),
 UNIQUE(destination_scope_key,destination_generation,operation_id),
 UNIQUE(source_scope_key,source_generation,operation_id),
 CHECK(source_scope_key<>destination_scope_key AND source_generation<>destination_generation),
 CHECK(receipt_json::jsonb=receipt),
 CHECK((jsonb_typeof(receipt)='object' AND receipt->>'formatVersion'='1'
   AND receipt->>'operationId'=operation_id::text AND receipt->>'intentDigest'=intent_digest
   AND receipt->>'copyProofDigest'=copy_proof_digest AND receipt->>'historyReceiptDigest'=history_receipt_digest
   AND receipt->>'digest'=receipt_digest AND receipt->>'auditId'=audit_id::text
   AND receipt->'source'->>'generation'=source_generation::text
   AND receipt->'destination'->>'generation'=destination_generation::text
   AND receipt->'source'->'scope'->>'environment'='staging'
   AND receipt->'destination'->'scope'->>'environment'='production') IS TRUE)
);
CREATE TRIGGER managed_transfer_completion_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_completions
 FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();

ALTER TABLE page_studio_cms_scopes ADD COLUMN transfer_id UUID,ADD COLUMN retained_by_transfer_id UUID;
ALTER TABLE page_studio_cms_scopes ALTER COLUMN adoption_id DROP NOT NULL;
-- Replace only the original enum and exclusive provenance constraints. Refuse
-- an unexpected schema rather than dropping unrelated data integrity checks.
DO $$ DECLARE constraint_name TEXT; matches INTEGER; relation_name TEXT; BEGIN
 SELECT count(*),min(conname) INTO matches,constraint_name FROM pg_constraint
 WHERE conrelid='page_studio_cms_scopes'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%legacy%' AND pg_get_constraintdef(oid) LIKE '%blocked%';
 IF matches<>1 THEN RAISE EXCEPTION 'Expected original CMS state constraint'; END IF;
 EXECUTE format('ALTER TABLE page_studio_cms_scopes DROP CONSTRAINT %I',constraint_name);
 FOREACH relation_name IN ARRAY ARRAY['page_studio_cms_objects','page_studio_application_versions'] LOOP
   SELECT count(*),min(conname) INTO matches,constraint_name FROM pg_constraint
   WHERE conrelid=relation_name::regclass AND contype='c'
   AND pg_get_constraintdef(oid) LIKE '%commit_id IS NULL%' AND pg_get_constraintdef(oid) LIKE '%adoption_id IS NULL%';
   IF matches<>1 THEN RAISE EXCEPTION 'Expected original CMS provenance constraint on %',relation_name; END IF;
   EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',relation_name,constraint_name);
 END LOOP;
END $$;
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_scope_state
 CHECK(state IN ('legacy','freezing','importing','managed','blocked','retained'));
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_scope_origin CHECK(num_nonnulls(adoption_id,transfer_id)=1);
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_scope_retention CHECK((state='retained')=(retained_by_transfer_id IS NOT NULL));
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_retained_source CHECK(state<>'retained' OR
 (environment='staging' AND active_generation IS NOT NULL AND current_application_id IS NOT NULL AND freeze_digest IS NOT NULL));
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_scope_transfer_fk
 FOREIGN KEY(scope_key,active_generation,transfer_id) REFERENCES page_studio_managed_transfer_completions(destination_scope_key,destination_generation,operation_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_scope_retention_fk
 FOREIGN KEY(scope_key,active_generation,retained_by_transfer_id) REFERENCES page_studio_managed_transfer_completions(source_scope_key,source_generation,operation_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE page_studio_cms_objects ADD COLUMN transfer_id UUID;
ALTER TABLE page_studio_cms_objects ADD CONSTRAINT page_studio_cms_object_origin CHECK(num_nonnulls(commit_id,adoption_id,transfer_id)=1);
ALTER TABLE page_studio_cms_objects ADD CONSTRAINT page_studio_cms_object_transfer_fk
 FOREIGN KEY(scope_key,generation,transfer_id) REFERENCES page_studio_managed_transfer_completions(destination_scope_key,destination_generation,operation_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE page_studio_application_versions ADD COLUMN transfer_id UUID;
ALTER TABLE page_studio_application_versions ADD CONSTRAINT page_studio_cms_application_origin CHECK(num_nonnulls(commit_id,adoption_id,transfer_id)=1);
ALTER TABLE page_studio_application_versions ADD CONSTRAINT page_studio_cms_application_transfer_fk
 FOREIGN KEY(scope_key,generation,transfer_id) REFERENCES page_studio_managed_transfer_completions(destination_scope_key,destination_generation,operation_id) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION page_studio_cms_transfer_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.transfer_id IS NOT NULL OR OLD.retained_by_transfer_id IS NOT NULL THEN RAISE EXCEPTION 'CMS transfer identity is immutable'; END IF;
   RETURN OLD;
 END IF;
 IF OLD.transfer_id IS NOT NULL OR OLD.retained_by_transfer_id IS NOT NULL THEN
   IF NEW.transfer_id IS DISTINCT FROM OLD.transfer_id OR NEW.retained_by_transfer_id IS DISTINCT FROM OLD.retained_by_transfer_id
     OR NEW.scope_key IS DISTINCT FROM OLD.scope_key OR NEW.target IS DISTINCT FROM OLD.target
     OR NEW.active_generation IS DISTINCT FROM OLD.active_generation OR NEW.freeze_digest IS DISTINCT FROM OLD.freeze_digest
     OR NEW.adoption_id IS DISTINCT FROM OLD.adoption_id THEN RAISE EXCEPTION 'CMS transfer identity is immutable'; END IF;
 END IF;
 IF OLD.retained_by_transfer_id IS NOT NULL AND
   (NEW.state IS DISTINCT FROM OLD.state OR NEW.current_application_id IS DISTINCT FROM OLD.current_application_id
    OR NEW.current_content_id IS DISTINCT FROM OLD.current_content_id) THEN RAISE EXCEPTION 'Retained source cannot resume authoring'; END IF;
 IF NEW.transfer_id IS NOT NULL AND (NEW.environment<>'production' OR NEW.state NOT IN ('managed','blocked')
   OR NEW.active_generation IS NULL OR NEW.freeze_digest IS NULL OR NEW.current_application_id IS NULL
   OR NEW.adoption_request IS NOT NULL OR NEW.adoption_receipt IS NOT NULL OR NEW.adoption_digest IS NOT NULL) THEN
   RAISE EXCEPTION 'Transferred scope requires explicit production provenance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER page_studio_cms_transfer_identity BEFORE UPDATE OR DELETE ON page_studio_cms_scopes
 FOR EACH ROW EXECUTE FUNCTION page_studio_cms_transfer_identity();
-- INSERT also validates destination provenance (OLD is deliberately not read).
CREATE FUNCTION page_studio_cms_transfer_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.transfer_id IS NOT NULL AND (NEW.environment<>'production' OR NEW.state NOT IN ('managed','blocked')
   OR NEW.active_generation IS NULL OR NEW.freeze_digest IS NULL OR NEW.current_application_id IS NULL
   OR NEW.adoption_request IS NOT NULL OR NEW.adoption_receipt IS NOT NULL OR NEW.adoption_digest IS NOT NULL) THEN
   RAISE EXCEPTION 'Transferred scope requires explicit production provenance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER page_studio_cms_transfer_insert BEFORE INSERT ON page_studio_cms_scopes
 FOR EACH ROW EXECUTE FUNCTION page_studio_cms_transfer_insert();

-- Deferred until every native row is present. It applies only to the terminal
-- insert, so later legitimate destination edits do not invalidate this receipt.
CREATE FUNCTION page_studio_managed_transfer_completion_check() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM page_studio_managed_transfer_intents i
  JOIN page_studio_managed_transfer_copy_graph_verifications c ON c.operation_id=i.operation_id
  JOIN page_studio_managed_transfer_copy_graph_requests r ON r.operation_id=i.operation_id
  JOIN page_studio_managed_transfer_forms_history_verifications h ON h.operation_id=i.operation_id
  JOIN page_studio_cms_scopes s ON s.scope_key=NEW.source_scope_key
  JOIN page_studio_cms_scopes d ON d.scope_key=NEW.destination_scope_key
  JOIN page_studio_sites site ON site.tenant_id=i.tenant_id AND site.client_id=i.client_id AND site.id=i.site_id
  JOIN page_studio_audit_events a ON a.tenant_id=i.tenant_id AND a.client_id=i.client_id AND a.site_id=i.site_id AND a.id=NEW.audit_id
  JOIN page_studio_application_versions sa ON sa.scope_key=s.scope_key AND sa.generation=s.active_generation AND sa.id=s.current_application_id
  JOIN page_studio_application_versions da ON da.scope_key=d.scope_key AND da.generation=d.active_generation AND da.id=d.current_application_id
  JOIN page_studio_checkpoints cp ON cp.tenant_id=i.tenant_id AND cp.client_id=i.client_id AND cp.site_id=i.site_id AND cp.id=site.current_checkpoint_id
  WHERE i.operation_id=NEW.operation_id AND i.intent_digest=NEW.intent_digest AND c.intent_digest=i.intent_digest AND h.intent_digest=i.intent_digest
   AND c.proof_digest=NEW.copy_proof_digest AND h.receipt_digest=NEW.history_receipt_digest
   AND i.source_scope_key=s.scope_key AND i.source_generation=NEW.source_generation AND i.destination_generation=NEW.destination_generation
   AND s.state='retained' AND s.retained_by_transfer_id=i.operation_id AND s.active_generation=NEW.source_generation
   AND r.request->'destinationGraph'->'scope'=NEW.receipt->'destination'->'scope'
   AND r.request->'destinationGraph'->'target'=d.target
   AND r.request->'destinationGraph'->>'freezeDigest'=d.freeze_digest
   AND r.request->'destinationGraph'->>'generation'=d.active_generation::text
   AND r.request->'destinationGraph'->>'applicationId'=d.current_application_id::text
   AND r.request->'destinationGraph'->>'checkpointId'=cp.id
   AND h.receipt->'destination'->'scope'=NEW.receipt->'destination'->'scope'
   AND h.receipt->'destination'->'target'=d.target
   AND c.proof->'graphReceipt'->'graph'->'base'->'application'->'manifest'=da.manifest
   AND c.proof->'graphReceipt'->'graph'->'base'->'application'->>'digest'=da.digest
   AND c.proof->'graphReceipt'->'graph'->'base'->'checkpoint'->>'id'=cp.id
   AND c.proof->'graphReceipt'->'graph'->'base'->'checkpoint'->>'digest'=cp.digest
   AND ((d.current_content_id IS NULL AND c.proof->'graphReceipt'->'graph'->'base'->'content'->'pin'='null'::jsonb)
    OR EXISTS(SELECT 1 FROM page_studio_cms_objects content WHERE content.scope_key=d.scope_key AND content.generation=d.active_generation
      AND content.id=d.current_content_id AND content.kind='content' AND content.storage_pin=c.proof->'graphReceipt'->'graph'->'base'->'content'->'pin'))
   AND d.state='managed' AND d.transfer_id=i.operation_id AND d.active_generation=NEW.destination_generation
   AND s.tenant_id=i.tenant_id AND s.client_id=i.client_id AND s.site_id=i.site_id AND s.environment='staging'
   AND d.tenant_id=i.tenant_id AND d.client_id=i.client_id AND d.site_id=i.site_id AND d.environment='production'
   AND NEW.receipt->'source'->'scope'=i.intent->'authority'->'source'
   AND NEW.receipt->'destination'->'scope'=i.intent->'authority'->'destination'
   AND NEW.receipt->'source'->'target'=s.target AND NEW.receipt->'destination'->'target'=d.target
   AND NEW.receipt->'source'->>'freezeDigest'=s.freeze_digest AND NEW.receipt->'destination'->>'freezeDigest'=d.freeze_digest
   AND NEW.receipt->'source'->'application'->>'id'=sa.id::text AND NEW.receipt->'source'->'application'->>'digest'=sa.digest
   AND NEW.receipt->'destination'->'application'->>'id'=da.id::text AND NEW.receipt->'destination'->'application'->>'digest'=da.digest
   AND NEW.receipt->'source'->'checkpoint'=sa.manifest->'checkpoint' AND NEW.receipt->'destination'->'checkpoint'=da.manifest->'checkpoint'
   AND NEW.receipt->'destination'->'checkpoint'->>'id'=cp.id AND NEW.receipt->'destination'->'checkpoint'->>'digest'=cp.digest
   AND (NEW.receipt->'source'->>'contentId') IS NOT DISTINCT FROM s.current_content_id::text
   AND (NEW.receipt->'destination'->>'contentId') IS NOT DISTINCT FROM d.current_content_id::text
   AND s.target=i.intent->'source'->'context'->'state'->'target'
   AND s.freeze_digest=i.intent->'source'->'context'->'state'->>'freeze_digest'
   AND s.current_content_id::text IS NOT DISTINCT FROM i.intent->'source'->'context'->'state'->>'current_content_id'
   AND sa.id::text=i.intent->'source'->'context'->'application'->>'id' AND sa.digest=i.intent->'source'->'context'->'application'->>'digest'
 ) THEN RAISE EXCEPTION 'Managed transfer completion does not match its verified native handoff'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER page_studio_managed_transfer_completion_check AFTER INSERT ON page_studio_managed_transfer_completions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_completion_check();
COMMIT;
