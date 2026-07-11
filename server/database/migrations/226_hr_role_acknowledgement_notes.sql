-- Preserve the employee's explanation when a role baseline is disputed.
ALTER TABLE hr_role_assignments
  ADD COLUMN IF NOT EXISTS acknowledgement_note TEXT;
