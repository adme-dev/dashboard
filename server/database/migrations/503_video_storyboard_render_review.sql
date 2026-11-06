-- T08: immutable review and dispatch evidence; no changes to legacy timelines.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS video_storyboard_review_copies (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES video_storyboards(project_id) ON DELETE CASCADE,
  timeline_id UUID NOT NULL,
  edit_revision INTEGER NOT NULL CHECK (edit_revision >= 0),
  source_copy_revision_id UUID NOT NULL,
  operation_id UUID NOT NULL,
  copy JSONB NOT NULL CHECK (jsonb_typeof(copy) = 'object'),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, operation_id),
  FOREIGN KEY (timeline_id, project_id) REFERENCES media_timelines(id, project_id)
);
CREATE TABLE IF NOT EXISTS video_storyboard_timeline_reviews (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES video_storyboards(project_id) ON DELETE CASCADE,
  timeline_id UUID NOT NULL,
  edit_revision INTEGER NOT NULL CHECK (edit_revision >= 0),
  operation_id UUID NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  contract JSONB NOT NULL CHECK (jsonb_typeof(contract) = 'object'),
  baseline_state JSONB NOT NULL CHECK (jsonb_typeof(baseline_state) = 'object'),
  reference_set_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, operation_id),
  FOREIGN KEY (timeline_id, project_id) REFERENCES media_timelines(id, project_id),
  FOREIGN KEY (project_id, reference_set_id) REFERENCES video_storyboard_reference_sets(project_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS media_render_jobs_id_project_timeline_unique ON media_render_jobs(id, project_id, timeline_id);
CREATE TABLE IF NOT EXISTS video_storyboard_render_manifests (
  job_id UUID PRIMARY KEY REFERENCES media_render_jobs(id) ON DELETE CASCADE,
  id UUID NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES video_storyboards(project_id) ON DELETE CASCADE,
  timeline_id UUID NOT NULL,
  edit_revision INTEGER NOT NULL CHECK (edit_revision >= 0),
  manifest JSONB NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_hash TEXT NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (timeline_id, project_id) REFERENCES media_timelines(id, project_id),
  FOREIGN KEY (job_id, project_id, timeline_id) REFERENCES media_render_jobs(id, project_id, timeline_id)
);
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['video_storyboard_review_copies','video_storyboard_timeline_reviews','video_storyboard_render_manifests'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=t::regclass AND tgname='video_storyboard_immutable') THEN
      EXECUTE format('CREATE TRIGGER video_storyboard_immutable BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION video_storyboard_reject_update()', t);
    END IF;
  END LOOP;
END $$;
COMMIT;
