-- Metadata only. D1 bodies are private until admitted here. Adoption is separate.
CREATE TABLE page_studio_cms_scopes (
 scope_key TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL, client_id UUID NOT NULL, business_id UUID NOT NULL,
 site_id UUID NOT NULL, environment TEXT NOT NULL CHECK(environment IN ('preview','staging','production')),
 state TEXT NOT NULL CHECK(state IN ('legacy','freezing','importing','managed','blocked')),
 adoption_id TEXT NOT NULL, active_generation UUID, pending_generation UUID,
 target JSONB NOT NULL CHECK(jsonb_typeof(target)='object'),
 freeze_digest TEXT CHECK(freeze_digest ~ '^[a-f0-9]{64}$'),
 inventory JSONB, import_progress JSONB,
 adoption_request JSONB, adoption_digest TEXT CHECK(adoption_digest ~ '^[a-f0-9]{64}$'), adoption_receipt JSONB,
 current_application_id UUID, current_content_id UUID,
 content_kind TEXT NOT NULL DEFAULT 'content' CHECK(content_kind='content'),
 CHECK(business_id=client_id),
 CHECK(scope_key=array_to_json(ARRAY[tenant_id,client_id::text,business_id::text,site_id::text,environment])::text),
 CHECK(state<>'managed' OR (active_generation IS NOT NULL AND current_application_id IS NOT NULL AND freeze_digest IS NOT NULL)),
 UNIQUE(tenant_id,client_id,business_id,site_id,environment),
 UNIQUE(scope_key,tenant_id,client_id,site_id),
 FOREIGN KEY(tenant_id,client_id,site_id) REFERENCES page_studio_sites(tenant_id,client_id,id)
);
CREATE TABLE page_studio_cms_commits (
 scope_key TEXT NOT NULL REFERENCES page_studio_cms_scopes(scope_key), generation UUID NOT NULL,
 tenant_id TEXT NOT NULL, client_id UUID NOT NULL, site_id UUID NOT NULL,
 id UUID NOT NULL, operation_id TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 prepared_digest TEXT NOT NULL CHECK(prepared_digest ~ '^[a-f0-9]{64}$'),
 request JSONB NOT NULL, result JSONB NOT NULL, actor_id TEXT NOT NULL,
 audit_id UUID NOT NULL,
 FOREIGN KEY(scope_key,tenant_id,client_id,site_id) REFERENCES page_studio_cms_scopes(scope_key,tenant_id,client_id,site_id),
 FOREIGN KEY(tenant_id,client_id,site_id,audit_id) REFERENCES page_studio_audit_events(tenant_id,client_id,site_id,id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(scope_key,operation_id), UNIQUE(scope_key,generation,id)
);
CREATE TABLE page_studio_cms_objects (
 scope_key TEXT NOT NULL REFERENCES page_studio_cms_scopes(scope_key), generation UUID NOT NULL,
 id UUID NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('content','schema','record')),
 collection_id TEXT NOT NULL, record_id TEXT NOT NULL, logical_version BIGINT NOT NULL CHECK(logical_version BETWEEN 1 AND 9007199254740991),
 storage_pin JSONB NOT NULL CHECK(jsonb_typeof(storage_pin)='object'),
 CHECK(storage_pin ?& ARRAY['kind','collectionId','recordId','version','origin','operationId','freezeDigest','sha256','bytes']),
 CHECK(storage_pin->>'kind'=kind AND storage_pin->>'collectionId'=collection_id AND storage_pin->>'recordId'=record_id AND (storage_pin->>'version')::bigint=logical_version),
 schema_object_id UUID, schema_kind TEXT NOT NULL DEFAULT 'schema' CHECK(schema_kind='schema'),
 archived BOOLEAN, baseline_head BOOLEAN, actor_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
 commit_id UUID, adoption_id TEXT,
 CHECK((commit_id IS NULL) <> (adoption_id IS NULL)),
 CHECK((kind='content' AND collection_id='' AND record_id='' AND schema_object_id IS NULL AND archived IS NULL)
 OR (kind='schema' AND collection_id<>'' AND record_id='' AND schema_object_id IS NULL AND archived IS NULL)
 OR (kind='record' AND collection_id<>'' AND record_id<>'' AND schema_object_id IS NOT NULL AND archived IS NOT NULL)),
 PRIMARY KEY(scope_key,generation,id),
 UNIQUE(scope_key,generation,kind,collection_id,record_id,logical_version),
 UNIQUE(scope_key,generation,id,kind), UNIQUE(scope_key,generation,id,kind,collection_id),
 UNIQUE(scope_key,generation,id,kind,collection_id,record_id),
 FOREIGN KEY(scope_key,generation,schema_object_id,schema_kind,collection_id) REFERENCES page_studio_cms_objects(scope_key,generation,id,kind,collection_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(scope_key,generation,commit_id) REFERENCES page_studio_cms_commits(scope_key,generation,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE page_studio_application_versions (
 scope_key TEXT NOT NULL REFERENCES page_studio_cms_scopes(scope_key),generation UUID NOT NULL,id UUID NOT NULL,
 digest TEXT NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), manifest JSONB NOT NULL,
 previous_application_id UUID, commit_id UUID, adoption_id TEXT,
 CHECK((commit_id IS NULL) <> (adoption_id IS NULL)),
 PRIMARY KEY(scope_key,generation,id),
 FOREIGN KEY(scope_key,generation,previous_application_id) REFERENCES page_studio_application_versions(scope_key,generation,id),
 FOREIGN KEY(scope_key,generation,commit_id) REFERENCES page_studio_cms_commits(scope_key,generation,id) DEFERRABLE INITIALLY DEFERRED
);
-- Typed selection relation gives application schemas a real composite FK.
CREATE TABLE page_studio_cms_application_schemas (
 scope_key TEXT NOT NULL,generation UUID NOT NULL,application_id UUID NOT NULL,
 collection_id TEXT NOT NULL,object_id UUID NOT NULL,
 kind TEXT NOT NULL DEFAULT 'schema' CHECK(kind='schema'),
 PRIMARY KEY(scope_key,generation,application_id,collection_id),
 FOREIGN KEY(scope_key,generation,application_id) REFERENCES page_studio_application_versions(scope_key,generation,id),
 FOREIGN KEY(scope_key,generation,object_id,kind,collection_id) REFERENCES page_studio_cms_objects(scope_key,generation,id,kind,collection_id)
);
CREATE TABLE page_studio_cms_record_heads (
 scope_key TEXT NOT NULL,generation UUID NOT NULL,collection_id TEXT NOT NULL,record_id TEXT NOT NULL,object_id UUID NOT NULL,
 kind TEXT NOT NULL DEFAULT 'record' CHECK(kind='record'),
 PRIMARY KEY(scope_key,generation,collection_id,record_id),
 FOREIGN KEY(scope_key,generation,object_id,kind,collection_id,record_id) REFERENCES page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id)
);
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_current_application_fk
 FOREIGN KEY(scope_key,active_generation,current_application_id) REFERENCES page_studio_application_versions(scope_key,generation,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_current_content_fk
 FOREIGN KEY(scope_key,active_generation,current_content_id,content_kind) REFERENCES page_studio_cms_objects(scope_key,generation,id,kind) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION page_studio_cms_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Accepted CMS metadata is immutable'; END $$;
CREATE TRIGGER page_studio_cms_objects_immutable BEFORE UPDATE OR DELETE ON page_studio_cms_objects FOR EACH ROW EXECUTE FUNCTION page_studio_cms_immutable();
CREATE TRIGGER page_studio_cms_commits_immutable BEFORE UPDATE OR DELETE ON page_studio_cms_commits FOR EACH ROW EXECUTE FUNCTION page_studio_cms_immutable();
CREATE TRIGGER page_studio_cms_applications_immutable BEFORE UPDATE OR DELETE ON page_studio_application_versions FOR EACH ROW EXECUTE FUNCTION page_studio_cms_immutable();
CREATE TRIGGER page_studio_cms_application_schemas_immutable BEFORE UPDATE OR DELETE ON page_studio_cms_application_schemas FOR EACH ROW EXECUTE FUNCTION page_studio_cms_immutable();

-- Recorded adoption identity and terminal receipt cannot be rewritten or erased.
CREATE FUNCTION page_studio_cms_adoption_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.adoption_request IS NOT NULL THEN RAISE EXCEPTION 'CMS adoption identity is immutable'; END IF;
   RETURN OLD;
 END IF;
 IF OLD.adoption_request IS NOT NULL AND
   (NEW.adoption_request IS DISTINCT FROM OLD.adoption_request OR NEW.adoption_digest IS DISTINCT FROM OLD.adoption_digest OR
    NEW.target IS DISTINCT FROM OLD.target OR NEW.adoption_id IS DISTINCT FROM OLD.adoption_id OR
    NEW.pending_generation IS DISTINCT FROM OLD.pending_generation OR NEW.scope_key IS DISTINCT FROM OLD.scope_key)
 THEN RAISE EXCEPTION 'CMS adoption identity is immutable'; END IF;
 IF OLD.freeze_digest IS NOT NULL AND NEW.freeze_digest IS DISTINCT FROM OLD.freeze_digest AND OLD.adoption_request IS NOT NULL
 THEN RAISE EXCEPTION 'CMS adoption freeze is immutable'; END IF;
 IF OLD.adoption_receipt IS NOT NULL AND NEW.adoption_receipt IS DISTINCT FROM OLD.adoption_receipt
 THEN RAISE EXCEPTION 'CMS adoption receipt is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER page_studio_cms_adoption_identity BEFORE UPDATE OR DELETE ON page_studio_cms_scopes FOR EACH ROW EXECUTE FUNCTION page_studio_cms_adoption_identity();

ALTER TABLE page_studio_cms_scopes ADD COLUMN adoption_recovery_id TEXT;
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_pending_generation_unique UNIQUE(scope_key,pending_generation);
CREATE TABLE page_studio_cms_adoption_recoveries (
 scope_key TEXT NOT NULL,generation UUID NOT NULL,recovery_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,client_id UUID NOT NULL,site_id UUID NOT NULL,
 adoption_digest TEXT NOT NULL,request_digest TEXT NOT NULL,request JSONB NOT NULL,
 principal JSONB NOT NULL,receipt JSONB NOT NULL,audit_id UUID NOT NULL,
 PRIMARY KEY(scope_key,recovery_id),
 FOREIGN KEY(scope_key,generation) REFERENCES page_studio_cms_scopes(scope_key,pending_generation),
 FOREIGN KEY(scope_key,tenant_id,client_id,site_id) REFERENCES page_studio_cms_scopes(scope_key,tenant_id,client_id,site_id),
 FOREIGN KEY(tenant_id,client_id,site_id,audit_id) REFERENCES page_studio_audit_events(tenant_id,client_id,site_id,id)
);
ALTER TABLE page_studio_cms_scopes ADD CONSTRAINT page_studio_cms_recovery_fk FOREIGN KEY(scope_key,adoption_recovery_id) REFERENCES page_studio_cms_adoption_recoveries(scope_key,recovery_id);
CREATE TRIGGER page_studio_cms_recoveries_immutable BEFORE UPDATE OR DELETE ON page_studio_cms_adoption_recoveries FOR EACH ROW EXECUTE FUNCTION page_studio_cms_immutable();
