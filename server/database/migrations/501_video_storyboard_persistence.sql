-- Storyboard revisions and project-scoped reference decisions. No media copies.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS video_storyboards (
  project_id UUID PRIMARY KEY REFERENCES media_projects(id) ON DELETE CASCADE,
  id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  current_revision_id UUID,
  current_reference_set_id UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS video_storyboard_reference_sets (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES video_storyboards(project_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  parent_id UUID,
  reference_data JSONB NOT NULL CHECK (jsonb_typeof(reference_data) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  operation_id UUID NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, id), UNIQUE (project_id, sequence), UNIQUE (project_id, operation_id),
  FOREIGN KEY (project_id, parent_id) REFERENCES video_storyboard_reference_sets(project_id, id)
);
CREATE TABLE IF NOT EXISTS video_storyboard_revisions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES video_storyboards(project_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  parent_id UUID,
  reference_set_id UUID NOT NULL,
  plan JSONB NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  plan_hash TEXT NOT NULL CHECK (plan_hash ~ '^[a-f0-9]{64}$'),
  copy_hash TEXT NOT NULL CHECK (copy_hash ~ '^[a-f0-9]{64}$'),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  operation_id UUID NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, id), UNIQUE (project_id, sequence), UNIQUE (project_id, operation_id),
  FOREIGN KEY (project_id, parent_id) REFERENCES video_storyboard_revisions(project_id, id),
  FOREIGN KEY (project_id, reference_set_id) REFERENCES video_storyboard_reference_sets(project_id, id)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='video_storyboards'::regclass AND conname='video_storyboards_current_revision_fk') THEN
    ALTER TABLE video_storyboards ADD CONSTRAINT video_storyboards_current_revision_fk
      FOREIGN KEY (project_id, current_revision_id) REFERENCES video_storyboard_revisions(project_id, id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='video_storyboards'::regclass AND conname='video_storyboards_current_reference_fk') THEN
    ALTER TABLE video_storyboards ADD CONSTRAINT video_storyboards_current_reference_fk
      FOREIGN KEY (project_id, current_reference_set_id) REFERENCES video_storyboard_reference_sets(project_id, id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
-- Reserve lineage storage for T06/T08; no application/obligation writer exists in T03.
CREATE UNIQUE INDEX IF NOT EXISTS media_timelines_id_project_unique ON media_timelines(id, project_id);
CREATE TABLE IF NOT EXISTS video_storyboard_applications (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES video_storyboards(project_id) ON DELETE CASCADE,
  storyboard_revision_id UUID NOT NULL,
  operation_id UUID NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  timeline_id UUID NOT NULL,
  timeline_edit_revision INTEGER NOT NULL CHECK (timeline_edit_revision >= 0),
  checkpoint_timeline_id UUID NOT NULL,
  receipt JSONB NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, id), UNIQUE (project_id, operation_id),
  FOREIGN KEY (project_id, storyboard_revision_id) REFERENCES video_storyboard_revisions(project_id, id),
  FOREIGN KEY (timeline_id, project_id) REFERENCES media_timelines(id, project_id),
  FOREIGN KEY (checkpoint_timeline_id, project_id) REFERENCES media_timelines(id, project_id)
);
CREATE TABLE IF NOT EXISTS video_storyboard_timeline_obligations (
  project_id UUID NOT NULL REFERENCES video_storyboards(project_id) ON DELETE CASCADE,
  timeline_id UUID NOT NULL,
  edit_revision INTEGER NOT NULL CHECK (edit_revision >= 0),
  application_id UUID NOT NULL,
  contract JSONB NOT NULL CHECK (jsonb_typeof(contract) = 'object'),
  contract_hash TEXT NOT NULL CHECK (contract_hash ~ '^[a-f0-9]{64}$'),
  review_state JSONB NOT NULL CHECK (jsonb_typeof(review_state) = 'object'),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (timeline_id, edit_revision),
  FOREIGN KEY (timeline_id, project_id) REFERENCES media_timelines(id, project_id),
  FOREIGN KEY (project_id, application_id) REFERENCES video_storyboard_applications(project_id, id)
);
-- Immutable history is enforced in storage, including future application receipts.
CREATE OR REPLACE FUNCTION video_storyboard_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Storyboard history is immutable' USING ERRCODE = '55000'; END $$;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['video_storyboard_reference_sets','video_storyboard_revisions','video_storyboard_applications','video_storyboard_timeline_obligations'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=t::regclass AND tgname='video_storyboard_immutable') THEN
      EXECUTE format('CREATE TRIGGER video_storyboard_immutable BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION video_storyboard_reject_update()', t);
    END IF;
  END LOOP;
END $$;
COMMIT;
