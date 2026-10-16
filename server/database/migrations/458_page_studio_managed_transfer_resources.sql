-- Private resource-only setup request. No resource allocation or route activation.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_resources (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_intents(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  request JSONB NOT NULL,
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  identity TEXT NOT NULL UNIQUE CHECK(identity ~ '^cms_attach_[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(octet_length(request::text)<=4096),
  CHECK((jsonb_typeof(request)='object'
    AND request->>'version'='1'
    AND request->>'mode'='attach-existing-content'
    AND request->>'operationId'='transfer_' || operation_id::text
    AND request->'scope'->>'environment'='production'
    AND request->'actor'->>'kind'='agency-user'
    AND request->>'policyVersion'='content-attachment-v1') IS TRUE)
);
DROP TRIGGER IF EXISTS page_studio_managed_transfer_resources_immutable ON page_studio_managed_transfer_resources;
CREATE TRIGGER page_studio_managed_transfer_resources_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_resources
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;
