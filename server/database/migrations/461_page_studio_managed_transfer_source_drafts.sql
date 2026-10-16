-- Retained authority for a private source Forms fence; not graph acceptance.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_source_drafts (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_executions(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  request JSONB NOT NULL,
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(octet_length(request::text)<=8192),
  CHECK((jsonb_typeof(request)='object'
    AND request->>'formatVersion'='1'
    AND request->>'operationId'=operation_id::text
    AND request->>'intentDigest'=intent_digest
    AND request->'fenceIntent'->>'nativeIntentDigest'=intent_digest
    AND request->'fenceIntent'->>'transferId'=operation_id::text
    AND request->'fenceIntent'->'scope'->>'environment'='staging') IS TRUE)
);
DROP TRIGGER IF EXISTS page_studio_managed_transfer_source_drafts_immutable ON page_studio_managed_transfer_source_drafts;
CREATE TRIGGER page_studio_managed_transfer_source_drafts_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_source_drafts
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;
