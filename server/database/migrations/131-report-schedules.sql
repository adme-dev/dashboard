-- 131: scheduled white-label analytics reports (Task 3.4)
CREATE TABLE IF NOT EXISTS report_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES agency_clients(id) ON DELETE CASCADE,  -- NULL = agency-wide
  cadence     TEXT NOT NULL CHECK (cadence IN ('weekly', 'monthly')),
  recipients  TEXT[] NOT NULL,
  branding    JSONB DEFAULT '{}'::jsonb,   -- { agencyName, logoUrl, accentColor }
  enabled     BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_schedules_enabled ON report_schedules(enabled) WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS report_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  UUID REFERENCES report_schedules(id) ON DELETE SET NULL,
  client_id    UUID,
  period_start DATE,
  period_end   DATE,
  r2_key       TEXT,
  report_url   TEXT,
  status       TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_runs_schedule ON report_runs(schedule_id, created_at DESC);
