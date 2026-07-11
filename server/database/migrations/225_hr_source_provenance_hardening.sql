-- KPI and department-goal measures must always identify their approved source.
-- This prevents a scored measure from existing without challengeable provenance.

ALTER TABLE hr_role_kpi_definitions
  ADD CONSTRAINT hr_role_kpi_definitions_source_ref_present
  CHECK (length(trim(source_ref)) > 0) NOT VALID;

ALTER TABLE hr_role_kpi_definitions
  VALIDATE CONSTRAINT hr_role_kpi_definitions_source_ref_present;

ALTER TABLE hr_role_kpi_definitions
  ALTER COLUMN source_ref SET NOT NULL;

ALTER TABLE hr_department_goal_versions
  ADD CONSTRAINT hr_department_goal_versions_source_ref_present
  CHECK (length(trim(source_ref)) > 0) NOT VALID;

ALTER TABLE hr_department_goal_versions
  VALIDATE CONSTRAINT hr_department_goal_versions_source_ref_present;

ALTER TABLE hr_department_goal_versions
  ALTER COLUMN source_ref SET NOT NULL;
