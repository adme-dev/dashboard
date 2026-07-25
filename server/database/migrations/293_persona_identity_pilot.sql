-- Persona Identity Core pilot
-- Additive, tenant-scoped evidence records. Existing CRM and lead tables remain
-- the systems of record and no historical data is rewritten.

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_identity_profiles_client_id_id
  ON crm_identity_profiles (client_id, id);

CREATE TABLE IF NOT EXISTS crm_identity_subject_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  subject_type TEXT NOT NULL CHECK (
    subject_type IN ('lead', 'browser_submission', 'provider_lead')
  ),
  subject_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, subject_type, subject_id),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_identity_subject_links_profile
  ON crm_identity_subject_links (client_id, profile_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS crm_identity_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  evidence_type TEXT NOT NULL CHECK (
    evidence_type IN (
      'confirmed_lead',
      'browser_submission',
      'provider_lead',
      'campaign_attribution',
      'identity_conflict'
    )
  ),
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  confidence NUMERIC(5, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, profile_id, evidence_type, source, source_id),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_identity_evidence_timeline
  ON crm_identity_evidence (client_id, profile_id, occurred_at DESC);

-- Backfill durable lead evidence for existing South Morang identity links.
-- Browser/provider HMAC keys are deliberately not reconstructed in SQL because
-- they must use the application identity secret. New intake creates those keys.
INSERT INTO crm_identity_subject_links (
  client_id,
  profile_id,
  subject_type,
  subject_id,
  metadata,
  first_seen_at,
  last_seen_at
)
SELECT identity_link.client_id,
       identity_link.profile_id,
       'lead',
       identity_link.lead_id::text,
       JSONB_BUILD_OBJECT(
         'source', lead.source,
         'provider', COALESCE(
           NULLIF(lead.field_data->>'lead_provider', ''),
           lead.source::text
         )
       ),
       lead.submitted_at,
       lead.submitted_at
  FROM crm_lead_identity_links identity_link
  JOIN leads lead
    ON lead.client_id = identity_link.client_id
   AND lead.id = identity_link.lead_id
   AND lead.deleted_at IS NULL
 WHERE identity_link.client_id = '1548b4d1-1857-46da-8f6a-38ca6c46f808'
ON CONFLICT (client_id, subject_type, subject_id) DO NOTHING;

INSERT INTO crm_identity_evidence (
  client_id,
  profile_id,
  evidence_type,
  source,
  source_id,
  confidence,
  metadata,
  occurred_at
)
SELECT identity_link.client_id,
       identity_link.profile_id,
       'confirmed_lead',
       lead.source::text,
       lead.id::text,
       100,
       JSONB_BUILD_OBJECT(
         'provider', COALESCE(
           NULLIF(lead.field_data->>'lead_provider', ''),
           lead.source::text
         ),
         'historicalBackfill', TRUE
       ),
       lead.submitted_at
  FROM crm_lead_identity_links identity_link
  JOIN leads lead
    ON lead.client_id = identity_link.client_id
   AND lead.id = identity_link.lead_id
   AND lead.deleted_at IS NULL
 WHERE identity_link.client_id = '1548b4d1-1857-46da-8f6a-38ca6c46f808'
ON CONFLICT (client_id, profile_id, evidence_type, source, source_id) DO NOTHING;

INSERT INTO crm_identity_evidence (
  client_id,
  profile_id,
  evidence_type,
  source,
  source_id,
  confidence,
  metadata,
  occurred_at
)
SELECT identity_link.client_id,
       identity_link.profile_id,
       'campaign_attribution',
       lead.source::text,
       lead.id::text,
       100,
       lead.attribution,
       lead.submitted_at
  FROM crm_lead_identity_links identity_link
  JOIN leads lead
    ON lead.client_id = identity_link.client_id
   AND lead.id = identity_link.lead_id
   AND lead.deleted_at IS NULL
 WHERE identity_link.client_id = '1548b4d1-1857-46da-8f6a-38ca6c46f808'
   AND lead.attribution IS NOT NULL
   AND lead.attribution <> '{}'::jsonb
ON CONFLICT (client_id, profile_id, evidence_type, source, source_id) DO NOTHING;

INSERT INTO client_feature_entitlements (
  client_id,
  feature_key,
  status,
  source,
  limits,
  starts_at,
  updated_at
) VALUES (
  '1548b4d1-1857-46da-8f6a-38ca6c46f808',
  'persona.identity',
  'trial',
  'south_morang_pilot',
  '{"read_only": true, "max_profiles": 250}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (client_id, feature_key) DO UPDATE
SET status = EXCLUDED.status,
    source = EXCLUDED.source,
    limits = EXCLUDED.limits,
    starts_at = COALESCE(client_feature_entitlements.starts_at, EXCLUDED.starts_at),
    updated_at = NOW();
