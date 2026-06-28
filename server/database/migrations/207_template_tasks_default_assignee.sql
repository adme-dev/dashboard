-- 207: explicit per-task default assignee on project-template tasks.
-- The live template_tasks already carries default_role + default_department_id;
-- this adds an optional explicit person so template authors can pin an assignee
-- (the most deterministic path for brief→project conversion). Additive + idempotent.

ALTER TABLE template_tasks
  ADD COLUMN IF NOT EXISTS default_assignee_id uuid REFERENCES team_members(id);
