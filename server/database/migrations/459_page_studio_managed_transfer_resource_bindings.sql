-- Private independently inspected resources. This does not select authoring or activate a release.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_resource_bindings (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_resources(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  destination_generation UUID NOT NULL UNIQUE,
  account_id TEXT NOT NULL CHECK(account_id ~ '^[a-f0-9]{32}$'),
  database_id UUID NOT NULL,
  namespace TEXT NOT NULL CHECK(namespace='xeroflow-page-studio-dispatch-production'),
  script_name TEXT NOT NULL CHECK(script_name ~ '^ps-content-[a-f0-9]{32}$'),
  binding JSONB NOT NULL,
  binding_digest TEXT NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(account_id,database_id),
  UNIQUE(account_id,namespace,script_name),
  CHECK(octet_length(binding::text)<=8192),
  CHECK((jsonb_typeof(binding)='object'
    AND binding->>'version'='1'
    AND binding->>'operationId'=operation_id::text
    AND binding->>'intentDigest'=intent_digest
    AND binding->>'destinationGeneration'=destination_generation::text
    AND binding->'physical'->'database'->>'accountId'=account_id
    AND binding->'physical'->'database'->>'databaseId'=database_id::text
    AND binding->'physical'->'worker'->>'accountId'=account_id
    AND binding->'physical'->'worker'->>'databaseId'=database_id::text
    AND binding->'physical'->'worker'->>'namespace'=namespace
    AND binding->'physical'->'worker'->>'scriptName'=script_name) IS TRUE)
);
DROP TRIGGER IF EXISTS page_studio_managed_transfer_resource_bindings_immutable ON page_studio_managed_transfer_resource_bindings;
CREATE TRIGGER page_studio_managed_transfer_resource_bindings_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_resource_bindings
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;
