BEGIN;
ALTER TABLE google_ads_action_plans
  ADD COLUMN IF NOT EXISTS review_policy TEXT NOT NULL DEFAULT 'legacy' CHECK (review_policy IN ('legacy','delegated_marketing')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS executed_by UUID REFERENCES team_members(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS google_ads_review_queue ON google_ads_action_plans(client_id,status,created_at) WHERE review_policy='delegated_marketing';
CREATE OR REPLACE FUNCTION protect_google_ads_action_plan_content()
RETURNS TRIGGER AS $$
DECLARE
  mutable_columns CONSTANT TEXT[] := ARRAY[
    'status','approval_id','provider_request_id','verification_summary','result_metadata',
    'claimed_at','completed_at','updated_at','reviewed_by','reviewed_at','rejection_reason','executed_by'
  ];
BEGIN
  IF (to_jsonb(NEW)-mutable_columns) IS DISTINCT FROM (to_jsonb(OLD)-mutable_columns) THEN
    RAISE EXCEPTION 'Google Ads action plan content is immutable; create a new plan instead';
  END IF;
  IF NEW.review_policy='delegated_marketing' AND NEW.reviewed_by=NEW.actor_id THEN
    RAISE EXCEPTION 'Independent Google Ads reviewer required';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMIT;
