-- Retain the exact verified Astro receipt independently of mutable site metadata.
-- Apply before enabling Astro completion; existing unverified successful Astro
-- rows must be investigated rather than inventing receipts for them.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE page_studio_builds ADD COLUMN IF NOT EXISTS astro_release_receipt JSONB;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='page_studio_astro_release_receipt_valid'
    AND conrelid='page_studio_builds'::regclass) THEN
    ALTER TABLE page_studio_builds ADD CONSTRAINT page_studio_astro_release_receipt_valid CHECK ((
      (renderer='legacy' AND astro_release_receipt IS NULL)
      OR (renderer='astro' AND state<>'succeeded' AND astro_release_receipt IS NULL)
      OR (renderer='astro' AND state='succeeded' AND completed_at IS NOT NULL AND failure_summary IS NULL
        AND astro_release_receipt IS NOT NULL AND jsonb_typeof(astro_release_receipt)='object'
        AND octet_length(astro_release_receipt::text)<=65536
        AND astro_release_receipt->>'renderer'='astro'
        AND astro_release_receipt->'success'='true'::jsonb
        AND astro_release_receipt->>'buildId'=id
        AND astro_release_receipt->>'versionDigest'=version_digest::text
        AND astro_release_receipt->>'artifactPrefix'=artifact_prefix
        AND astro_release_receipt->>'manifestKey'=release_manifest_key
        AND astro_release_receipt->>'manifestDigest'=release_manifest_digest::text
        AND astro_release_receipt->>'validationKey'=validation_report_key
        AND release_manifest_digest::text ~ '^[a-f0-9]{64}$'
        AND astro_release_receipt#>>'{astro,manifestDigest}' ~ '^[a-f0-9]{64}$'
        AND astro_release_receipt#>>'{astro,policyDigest}' ~ '^[a-f0-9]{64}$'
        AND astro_release_receipt#>>'{astro,context,buildId}'=id
        AND astro_release_receipt#>>'{astro,context,identityDigest}'=build_identity_digest
        AND astro_release_receipt#>'{astro,context,identity}'=build_identity
        AND artifact_prefix='tenants/' || tenant_id || '/clients/' || client_id::text || '/sites/' || site_id::text
          || '/astro/' || (build_identity->>'environment') || '/' || id || '/' || (astro_release_receipt#>>'{astro,manifestDigest}')
        AND release_manifest_key=artifact_prefix || '/release-manifest.json'
        AND validation_report_key=artifact_prefix || '/validation-report.json')
    ) IS TRUE);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION protect_page_studio_astro_release_receipt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.renderer='astro' AND OLD.state='succeeded' AND
    ROW(NEW.state,NEW.artifact_prefix,NEW.release_manifest_key,NEW.release_manifest_digest,
        NEW.validation_report_key,NEW.astro_release_receipt,NEW.completed_at,NEW.failure_summary)
    IS DISTINCT FROM
    ROW(OLD.state,OLD.artifact_prefix,OLD.release_manifest_key,OLD.release_manifest_digest,
        OLD.validation_report_key,OLD.astro_release_receipt,OLD.completed_at,OLD.failure_summary) THEN
    RAISE EXCEPTION 'ASTRO_RELEASE_RECEIPT_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_astro_release_receipt_guard ON page_studio_builds;
CREATE TRIGGER page_studio_astro_release_receipt_guard BEFORE UPDATE ON page_studio_builds
  FOR EACH ROW EXECUTE FUNCTION protect_page_studio_astro_release_receipt();

COMMENT ON COLUMN page_studio_builds.astro_release_receipt IS
  'Verified Astro build result, immutable after success. Native completion independently validates bytes, identity/toolchain, policy and current authority before persisting; SQL enforces receipt/row consistency, not compiler provenance.';
COMMIT;
