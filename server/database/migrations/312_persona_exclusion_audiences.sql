BEGIN;

-- Marks a persona_definitions row as an exclusion audience rather than a
-- positive targeting cohort. Reuses scorePersonaDefinition unchanged: an
-- exclusion definition sets positive_signals to the trigger signals,
-- negative_signals empty, min_confidence near-zero (0.01, same trick
-- migration 311 used for tiers) so "qualifies" reduces to "matched at
-- least one trigger signal," not a weighted score.
ALTER TABLE crm_persona_definitions
  ADD COLUMN IF NOT EXISTS is_exclusion BOOLEAN NOT NULL DEFAULT FALSE;

-- One row per profile currently in the exclusion set, recomputed nightly
-- alongside tier memberships from the same signal aggregation. Single
-- blended list (no per-reason breakdown table) per the v1 scope decision;
-- matched_signals still records which trigger(s) fired, for debugging.
CREATE TABLE IF NOT EXISTS crm_persona_exclusion_memberships (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  matched_signals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, profile_id),
  CONSTRAINT crm_persona_exclusion_memberships_profile_fk
    FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id)
    ON DELETE CASCADE
);

-- Seed the one system-level exclusion definition (client_id NULL, same
-- override-per-client mechanism crm_persona_definitions already supports
-- for tiers/personas, available later without new plumbing).
INSERT INTO crm_persona_definitions (
  client_id, vertical, persona_key, version, label, description,
  positive_signals, negative_signals, min_confidence, is_exclusion,
  allowed_channels, targeting_allowed, reporting_allowed, status
)
SELECT NULL, 'automotive', 'negative_signal_exclusion', 1,
       'Negative Signal Exclusion',
       'Visitors who showed competitor-shopping or early-exit intent.',
       '["competitive_referrer","exit_intent"]'::jsonb, '[]'::jsonb,
       0.01, TRUE, ARRAY['google','meta']::TEXT[], TRUE, TRUE, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM crm_persona_definitions existing
  WHERE existing.client_id IS NULL AND existing.vertical = 'automotive'
    AND existing.persona_key = 'negative_signal_exclusion' AND existing.version = 1
);

COMMIT;
