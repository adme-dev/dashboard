BEGIN;

-- Persona/cohort scoring (crm_persona_definitions, scorePersonaDefinition)
-- has been preview-only — the live Meta/Google export path never consults
-- it. tier_rank marks a persona definition as a ranked intent tier (Hot=1,
-- Warm=2, Cold=3); the other existing personas (active_vehicle_shopper,
-- finance_ready, returning_high_intent) stay NULL, unaffected.
ALTER TABLE crm_persona_definitions
  ADD COLUMN tier_rank INTEGER NULL;

-- One row per profile: their current single highest-ranked tier, recomputed
-- nightly from the last 30 days of crm_customer_signals. This is what makes
-- a tier a real, joinable audience filter for loadEligibleMembers, not just
-- a preview stat.
CREATE TABLE crm_persona_tier_memberships (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  tier_key TEXT NOT NULL CHECK (tier_key IN ('hot', 'warm', 'cold')),
  matched_signals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, profile_id),
  CONSTRAINT crm_persona_tier_memberships_profile_fk
    FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id)
    ON DELETE CASCADE
);

CREATE INDEX idx_crm_persona_tier_memberships_tier
  ON crm_persona_tier_memberships (client_id, tier_key);

-- Seed the 3 ranked tier definitions, same idempotent pattern as migration
-- 295's original 3 personas. persona_key is exactly 'hot'/'warm'/'cold' so
-- it maps 1:1 onto crm_persona_tier_memberships.tier_key with no
-- transformation needed in the recompute job. min_confidence is
-- near-zero (0.01): tier qualification means "matched at least one
-- positive signal," not a confidence threshold — rank order does the
-- actual tie-breaking, not scorePersonaDefinition's confidence score.
INSERT INTO crm_persona_definitions (
  client_id, vertical, persona_key, version, label, description,
  positive_signals, negative_signals, min_confidence, tier_rank,
  allowed_channels, targeting_allowed, reporting_allowed, status
)
SELECT NULL, seed.vertical, seed.persona_key, 1, seed.label, seed.description,
       seed.positive_signals::jsonb, '[]'::jsonb, 0.01, seed.tier_rank,
       ARRAY['google', 'meta']::TEXT[], TRUE, TRUE, 'active'
FROM (
  VALUES
    ('automotive', 'hot', 'Hot', 'Near-conversion intent.',
     '["form_start","add_to_wishlist","test_drive_booking","finance_calculator_interact","trade_in_start","generate_lead","lead_created"]',
     1),
    ('automotive', 'warm', 'Warm', 'Cross-shop depth and repeat consideration.',
     '["vehicle_comparison","return_to_vehicle"]',
     2),
    ('automotive', 'cold', 'Cold', 'Baseline browsing.',
     '["vehicle_view","vehicle_list_view","search","filter_change"]',
     3)
) AS seed(vertical, persona_key, label, description, positive_signals, tier_rank)
WHERE NOT EXISTS (
  SELECT 1 FROM crm_persona_definitions existing
  WHERE existing.client_id IS NULL AND existing.vertical = seed.vertical
    AND existing.persona_key = seed.persona_key AND existing.version = 1
);

COMMIT;
