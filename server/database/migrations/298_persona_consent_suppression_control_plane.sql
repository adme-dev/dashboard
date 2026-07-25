BEGIN;

ALTER TABLE crm_consent_history
  ADD COLUMN IF NOT EXISTS policy_version TEXT NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN IF NOT EXISTS notice_url TEXT,
  ADD COLUMN IF NOT EXISTS decision_method TEXT NOT NULL DEFAULT 'snapshot',
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE crm_consent_history
  DROP CONSTRAINT IF EXISTS crm_consent_history_evidence_object;
ALTER TABLE crm_consent_history
  ADD CONSTRAINT crm_consent_history_evidence_object
  CHECK (jsonb_typeof(evidence) = 'object');

CREATE TABLE IF NOT EXISTS crm_persona_suppression_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID,
  subject_hash TEXT,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('tracking', 'analytics', 'marketing', 'communications', 'all')),
  channel TEXT NOT NULL DEFAULT 'all'
    CHECK (channel IN ('ads', 'email', 'sms', 'voice', 'all')),
  destination TEXT NOT NULL DEFAULT 'all',
  action TEXT NOT NULL CHECK (action IN ('suppress', 'release')),
  reason_code TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object'),
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('person', 'client_user', 'agency_user', 'provider', 'system')),
  actor_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_persona_suppression_subject_required
    CHECK (profile_id IS NOT NULL OR subject_hash IS NOT NULL),
  CONSTRAINT crm_persona_suppression_profile_fk
    FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id)
    ON DELETE SET NULL (profile_id),
  CONSTRAINT crm_persona_suppression_source_unique
    UNIQUE (client_id, source_type, source_id, purpose, channel, destination)
);

CREATE INDEX IF NOT EXISTS idx_crm_persona_suppression_profile_time
  ON crm_persona_suppression_events (client_id, profile_id, occurred_at DESC)
  WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_persona_suppression_subject_time
  ON crm_persona_suppression_events (client_id, subject_hash, occurred_at DESC)
  WHERE subject_hash IS NOT NULL;

DROP TRIGGER IF EXISTS trg_crm_persona_suppression_append_only
  ON crm_persona_suppression_events;
CREATE TRIGGER trg_crm_persona_suppression_append_only
  BEFORE UPDATE OR DELETE ON crm_persona_suppression_events
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

CREATE OR REPLACE VIEW crm_persona_current_suppressions AS
WITH ranked AS (
  SELECT event.*,
         COALESCE(event.profile_id::text, 'subject:' || event.subject_hash) AS identity_scope,
         ROW_NUMBER() OVER (
           PARTITION BY
             event.client_id,
             COALESCE(event.profile_id::text, 'subject:' || event.subject_hash),
             event.purpose,
             event.channel,
             event.destination
           ORDER BY event.occurred_at DESC, event.created_at DESC, event.id DESC
         ) AS decision_rank
    FROM crm_persona_suppression_events event
)
SELECT
  id,
  client_id,
  profile_id,
  subject_hash,
  identity_scope,
  purpose,
  channel,
  destination,
  reason_code,
  source_type,
  source_id,
  evidence,
  actor_type,
  actor_id,
  occurred_at,
  created_at
FROM ranked
WHERE decision_rank = 1
  AND action = 'suppress';

CREATE OR REPLACE FUNCTION crm_persona_marketing_eligible(
  p_client_id UUID,
  p_profile_id UUID,
  p_subject_hash TEXT,
  p_destination TEXT
) RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  WITH latest_consent AS (
    SELECT history.marketing
      FROM crm_consent_history history
     WHERE history.client_id = p_client_id
       AND (
         (p_profile_id IS NOT NULL AND history.profile_id = p_profile_id)
         OR
         (p_subject_hash IS NOT NULL AND history.subject_hash = p_subject_hash)
       )
     ORDER BY history.occurred_at DESC, history.created_at DESC, history.id DESC
     LIMIT 1
  )
  SELECT
    COALESCE((SELECT marketing = 'granted' FROM latest_consent), FALSE)
    AND NOT EXISTS (
      SELECT 1
        FROM crm_persona_current_suppressions suppression
       WHERE suppression.client_id = p_client_id
         AND (
           (p_profile_id IS NOT NULL AND suppression.profile_id = p_profile_id)
           OR
           (p_subject_hash IS NOT NULL AND suppression.subject_hash = p_subject_hash)
         )
         AND suppression.purpose IN ('marketing', 'all')
         AND suppression.channel IN ('ads', 'all')
         AND suppression.destination IN (p_destination, 'all')
    );
$$;

CREATE OR REPLACE FUNCTION enforce_persona_export_member_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  member_payload JSONB := to_jsonb(NEW);
  export_id UUID;
  member_profile_id UUID;
  member_subject_hash TEXT;
  export_operation TEXT;
  export_provider TEXT;
BEGIN
  export_id := NULLIF(member_payload ->> 'export_id', '')::uuid;
  member_profile_id := NULLIF(member_payload ->> 'profile_id', '')::uuid;
  member_subject_hash := NULLIF(member_payload ->> 'subject_hash', '');

  SELECT export.operation, export.provider
    INTO export_operation, export_provider
    FROM crm_persona_audience_exports export
   WHERE export.id = export_id
     AND export.client_id = NEW.client_id;

  IF export_operation IS NULL THEN
    RAISE EXCEPTION 'Audience export is missing or belongs to another client';
  END IF;

  -- Removal must remain possible after consent withdrawal or suppression.
  IF export_operation <> 'sync' THEN
    RETURN NEW;
  END IF;

  IF member_profile_id IS NULL AND member_subject_hash IS NULL THEN
    RAISE EXCEPTION 'Audience sync member requires a governed identity reference';
  END IF;

  IF NOT crm_persona_marketing_eligible(
    NEW.client_id,
    member_profile_id,
    member_subject_hash,
    export_provider
  ) THEN
    RAISE EXCEPTION 'Audience sync member is not currently marketing eligible';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_persona_export_member_consent
  ON crm_persona_audience_export_members;
CREATE TRIGGER trg_persona_export_member_consent
  BEFORE INSERT OR UPDATE ON crm_persona_audience_export_members
  FOR EACH ROW EXECUTE FUNCTION enforce_persona_export_member_consent();

COMMIT;
