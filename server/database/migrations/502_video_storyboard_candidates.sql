-- Durable planning operations. A candidate never advances the active plan pointer.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS video_storyboard_candidates (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES video_storyboards(project_id) ON DELETE CASCADE,
  operation_id UUID NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  base_revision_id UUID,
  reference_set_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','completed','failed')),
  result JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (project_id, operation_id),
  FOREIGN KEY (project_id, base_revision_id) REFERENCES video_storyboard_revisions(project_id,id),
  FOREIGN KEY (project_id, reference_set_id) REFERENCES video_storyboard_reference_sets(project_id,id),
  CHECK ((status='pending' AND result IS NULL AND finished_at IS NULL)
      OR (status='failed' AND result IS NULL AND finished_at IS NOT NULL)
      OR (status='completed' AND result IS NOT NULL AND jsonb_typeof(result)='object' AND finished_at IS NOT NULL))
);
CREATE OR REPLACE FUNCTION video_storyboard_candidate_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('completed','failed') OR
    (to_jsonb(OLD) - ARRAY['status','result','finished_at']) IS DISTINCT FROM
    (to_jsonb(NEW) - ARRAY['status','result','finished_at']) THEN
    RAISE EXCEPTION 'Storyboard candidate identity and terminal result are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='video_storyboard_candidates'::regclass AND tgname='video_storyboard_candidate_transition') THEN
    CREATE TRIGGER video_storyboard_candidate_transition BEFORE UPDATE ON video_storyboard_candidates FOR EACH ROW EXECUTE FUNCTION video_storyboard_candidate_transition();
  END IF;
END $$;
COMMIT;
