-- Private destination catalogue authority only. No installation or selection.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_destination_catalogues (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_resource_bindings(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  request JSONB NOT NULL,
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(octet_length(request::text)<=65536),
  CHECK((jsonb_typeof(request)='object'
    AND request->>'formatVersion'='1'
    AND request->>'operationId'=operation_id::text
    AND request->>'intentDigest'=intent_digest
    AND request->'resourceRequest'->>'operationId'=operation_id::text
    AND request->'resourceRequest'->>'intentDigest'=intent_digest
    AND request->'resourceRequest'->'resourceRequest'->>'operationId'='transfer_' || operation_id::text
    AND request->'resourceRequest'->'resourceRequest'->'scope'->>'environment'='production'
    AND request->'baseline'->>'operationId'=operation_id::text
    AND request->'baseline'->>'intentDigest'=intent_digest
    AND request->'baseline'->'worker'->'scope'->>'environment'='production') IS TRUE)
);
DROP TRIGGER IF EXISTS page_studio_managed_transfer_destination_catalogues_immutable ON page_studio_managed_transfer_destination_catalogues;
CREATE TRIGGER page_studio_managed_transfer_destination_catalogues_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_destination_catalogues
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;
