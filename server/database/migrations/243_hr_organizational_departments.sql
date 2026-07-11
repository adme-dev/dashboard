-- Separate governed people departments from operational/Monday workspaces.
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS department_kind TEXT NOT NULL DEFAULT 'workspace';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_department_kind_check'
  ) THEN
    ALTER TABLE departments
      ADD CONSTRAINT departments_department_kind_check
      CHECK (department_kind IN ('organizational', 'workspace'));
  END IF;
END $$;

UPDATE departments
   SET department_kind = 'organizational'
 WHERE slug IN ('creative', 'marketing', 'production', 'account-services', 'operations');

CREATE INDEX IF NOT EXISTS idx_departments_kind_active
  ON departments (department_kind, is_active, sort_order, name);
