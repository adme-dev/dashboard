-- 208: structured per-channel job budget model (brief→job P2).
-- A job's budget is a set of typed allocations (campaign_type × platform), each with an
-- explicit period/month/state, instead of a single bare number that can disagree with its
-- parts — plus a change log recording who/why for every edit. This kills the
-- "$600 vs $700 lifetime" + "SEM vs PMax" ambiguity (Geelong Kia conquest thread).
-- Additive + idempotent. Grounds: docs/superpowers/specs/2026-06-28-structured-job-budget-model.md

CREATE TABLE IF NOT EXISTS job_budget_allocations (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  brief_id      uuid REFERENCES briefs(id) ON DELETE SET NULL,
  campaign_type text,                         -- Monday campaign code (G_Search, M_AIA_Leads, …) or null
  platform      text,                         -- Google | Meta | TikTok | Spotify (derived from campaign_type prefix)
  amount        numeric(12, 2) NOT NULL DEFAULT 0,
  currency      varchar(3) NOT NULL DEFAULT 'AUD',
  period        text NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'total')),
  month         varchar(7),                   -- YYYY-MM; expected when period = 'monthly'
  state         text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'active', 'paused')),
  source        text NOT NULL DEFAULT 'brief' CHECK (source IN ('brief', 'manual', 'ai')),
  created_by    uuid REFERENCES team_members(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_budget_alloc_project ON job_budget_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_job_budget_alloc_brief   ON job_budget_allocations(brief_id);

-- Every edit (amount, state, campaign_type, …) is recorded with who + why, so a
-- $500→$600 / SEM→PMax move is legible history, not a Slack "remember?".
CREATE TABLE IF NOT EXISTS job_budget_changes (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  allocation_id uuid NOT NULL REFERENCES job_budget_allocations(id) ON DELETE CASCADE,
  field         text NOT NULL,
  old_value     text,
  new_value     text,
  changed_by    uuid REFERENCES team_members(id),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  reason        text
);

CREATE INDEX IF NOT EXISTS idx_job_budget_changes_alloc ON job_budget_changes(allocation_id);
