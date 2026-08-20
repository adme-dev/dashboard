-- Pilot hardening: durable confirmation replay, cross-registry compliance targets,
-- creative-source provenance, and explicit internal QA project isolation.
BEGIN;

ALTER TABLE ai_pending_actions
  ADD COLUMN IF NOT EXISTS result_payload JSONB;

ALTER TABLE video_gen_source_assets
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_asset_ref TEXT,
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS video_gen_source_assets_source_ref_unique
  ON video_gen_source_assets (COALESCE(client_id::text, 'agency'), source_system, source_asset_ref)
  WHERE source_system IS NOT NULL AND source_asset_ref IS NOT NULL;

ALTER TABLE creative_compliance_checks
  ALTER COLUMN asset_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_asset_id UUID REFERENCES video_gen_source_assets(id) ON DELETE RESTRICT;

ALTER TABLE creative_compliance_checks
  DROP CONSTRAINT IF EXISTS creative_compliance_checks_one_target;
ALTER TABLE creative_compliance_checks
  ADD CONSTRAINT creative_compliance_checks_one_target
  CHECK ((asset_id IS NOT NULL)::int + (source_asset_id IS NOT NULL)::int = 1);

ALTER TABLE media_projects
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

-- This known pilot project must never attribute QA activity to Arctic Campers.
UPDATE media_projects
   SET client_id = NULL, is_test = true, updated_at = now()
 WHERE id = 'eca5685a-14bf-411b-ad35-53394f6bbb44'::uuid;

COMMIT;
