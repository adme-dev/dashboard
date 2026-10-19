-- Historical private catalogue evidence only; never destination selection.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_managed_transfer_catalogue_verifications (
  operation_id UUID PRIMARY KEY REFERENCES page_studio_managed_transfer_destination_catalogues(operation_id),
  intent_digest TEXT NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  plan_digest TEXT NOT NULL CHECK(plan_digest ~ '^[a-f0-9]{64}$'),
  receipt JSONB NOT NULL,
  receipt_digest TEXT NOT NULL CHECK(receipt_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(octet_length(receipt::text)<=65536),
  CHECK((jsonb_typeof(receipt)='object'
    AND receipt->>'formatVersion'='1'
    AND receipt->>'operationId'=operation_id::text
    AND receipt->>'intentDigest'=intent_digest
    AND receipt->>'requestDigest'=request_digest
    AND receipt->>'planDigest'=plan_digest
    AND receipt->>'digest'=receipt_digest) IS TRUE)
);
DROP TRIGGER IF EXISTS page_studio_managed_transfer_catalogue_verifications_immutable ON page_studio_managed_transfer_catalogue_verifications;
CREATE TRIGGER page_studio_managed_transfer_catalogue_verifications_immutable BEFORE UPDATE OR DELETE ON page_studio_managed_transfer_catalogue_verifications
  FOR EACH ROW EXECUTE FUNCTION page_studio_managed_transfer_intent_immutable();
COMMIT;
