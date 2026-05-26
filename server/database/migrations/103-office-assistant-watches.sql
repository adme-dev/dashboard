-- Office-aware assistant watches and visible execution jobs.

CREATE TABLE IF NOT EXISTS office_assistant_watches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id         uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  watch_type        text NOT NULL
                    CHECK (watch_type IN ('person_available','room_occupied','co_presence','meeting_ended','lobby_guest_waiting')),
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','triggered','cancelled')),
  label             text NOT NULL,
  conditions        jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery          jsonb NOT NULL DEFAULT '{"notification": true}'::jsonb,
  last_triggered_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_assistant_watches_office_user
  ON office_assistant_watches(office_id, user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_assistant_watches_type
  ON office_assistant_watches(office_id, watch_type, status);

CREATE TABLE IF NOT EXISTS office_assistant_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id         uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  watch_id          uuid REFERENCES office_assistant_watches(id) ON DELETE SET NULL,
  user_id           uuid REFERENCES team_members(id) ON DELETE SET NULL,
  job_type          text NOT NULL
                    CHECK (job_type IN ('notify','schedule_meeting','send_follow_up','summarize_thread','collect_status')),
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','waiting_approval','completed','failed','cancelled')),
  title             text NOT NULL,
  input             jsonb NOT NULL DEFAULT '{}'::jsonb,
  result            jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_required boolean NOT NULL DEFAULT false,
  approved_by       uuid REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_assistant_jobs_office
  ON office_assistant_jobs(office_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_assistant_jobs_watch
  ON office_assistant_jobs(watch_id, created_at DESC)
  WHERE watch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_office_assistant_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_office_assistant_watches_updated_at ON office_assistant_watches;
CREATE TRIGGER update_office_assistant_watches_updated_at
  BEFORE UPDATE ON office_assistant_watches
  FOR EACH ROW
  EXECUTE FUNCTION update_office_assistant_updated_at();

DROP TRIGGER IF EXISTS update_office_assistant_jobs_updated_at ON office_assistant_jobs;
CREATE TRIGGER update_office_assistant_jobs_updated_at
  BEFORE UPDATE ON office_assistant_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_office_assistant_updated_at();
