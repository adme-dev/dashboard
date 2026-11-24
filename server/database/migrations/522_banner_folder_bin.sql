BEGIN;
ALTER TABLE banner_projects ADD COLUMN IF NOT EXISTS binned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS banner_projects_bin_expiry_idx ON banner_projects(binned_at) WHERE binned_at IS NOT NULL;
ALTER TABLE banner_folders ADD COLUMN IF NOT EXISTS bin_root_id UUID;
ALTER TABLE banner_folders ADD COLUMN IF NOT EXISTS binned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS banner_folders_bin_root_idx ON banner_folders(bin_root_id) WHERE bin_root_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS banner_folders_bin_expiry_idx ON banner_folders(binned_at) WHERE binned_at IS NOT NULL;

-- Serialize a new assignment with a simultaneous folder deletion.
CREATE OR REPLACE FUNCTION check_banner_project_folder_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.folder_id IS DISTINCT FROM OLD.folder_id) THEN
    PERFORM 1 FROM banner_folders WHERE id = NEW.folder_id AND binned_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Destination folder is unavailable' USING ERRCODE = '23503'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS banner_project_active_folder ON banner_projects;
CREATE TRIGGER banner_project_active_folder BEFORE INSERT OR UPDATE OF folder_id ON banner_projects
  FOR EACH ROW EXECUTE FUNCTION check_banner_project_folder_active();
COMMIT;
