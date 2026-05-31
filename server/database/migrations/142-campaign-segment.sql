-- 142: campaign segmentation (email Phase 5).
-- A campaign may carry a Segment — a match-all/match-any list of field/op/value
-- rules (see server/utils/email-marketing/segment.ts) — that narrows the
-- materialized recipient set to subscribers whose attribs/status match.
-- Additive + idempotent. NULL = no segment = whole target list (prior behaviour).
-- NOTE: 138 (CRM activities) / 139 (tracking) / 140 (leads) / 141 (CRM engine)
-- are claimed by concurrent branches; email segmentation takes 142.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS filter_rules JSONB;
