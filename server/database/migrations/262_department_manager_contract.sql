-- Restore the department manager contract used by the native board APIs.
-- Production departments predate the workflow schema file that declared this
-- column, so board creation and department detail/update routes could reference
-- a column that was never added by a numbered migration.

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_departments_manager
  ON departments(manager_id)
  WHERE manager_id IS NOT NULL;
