-- 085: Advisor Triage + Authoring
-- Adds category, effort, snooze, source, and created_by to recommendations.
-- Schema for slices 1, 2, and 3 of the advisor triage phase. Comments
-- table is added separately in migration 086 (slice 4).

ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN (
      'cashflow','collections','pricing','margin',
      'cost-control','growth','staffing','tax-compliance','risk'
    )),
  ADD COLUMN IF NOT EXISTS effort TEXT
    CHECK (effort IN ('xs','s','m','l','xl')),
  ADD COLUMN IF NOT EXISTS snoozed_until DATE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai','manual'));

CREATE INDEX IF NOT EXISTS idx_reco_category
  ON recommendations(tenant_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reco_snoozed
  ON recommendations(tenant_id, snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reco_source
  ON recommendations(tenant_id, source);
