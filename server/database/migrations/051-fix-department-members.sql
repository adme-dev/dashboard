-- Fix department_members: rename user_id → team_member_id to match codebase conventions
-- and add is_primary column used by capacity/heatmap/utilization queries

ALTER TABLE department_members RENAME COLUMN user_id TO team_member_id;

ALTER TABLE department_members ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT true;

-- Recreate unique constraint with new column name
ALTER TABLE department_members DROP CONSTRAINT IF EXISTS department_members_department_id_user_id_key;
ALTER TABLE department_members ADD CONSTRAINT department_members_dept_member_key UNIQUE (department_id, team_member_id);

-- Recreate indexes with new column name
DROP INDEX IF EXISTS idx_dept_members_user;
CREATE INDEX idx_dept_members_member ON department_members (team_member_id);
