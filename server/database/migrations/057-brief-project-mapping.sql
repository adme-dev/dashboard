-- ============================================
-- Brief → Project Mapping
-- Links brief templates to project templates
-- for auto-conversion on approval
-- ============================================

ALTER TABLE brief_templates
  ADD COLUMN IF NOT EXISTS project_template_id UUID REFERENCES project_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS field_mapping JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_convert_on_approval BOOLEAN DEFAULT false;

ALTER TABLE briefs
  ADD COLUMN IF NOT EXISTS auto_project_created BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_to_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_brief_templates_project_template
  ON brief_templates(project_template_id) WHERE project_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_briefs_converted_project
  ON briefs(converted_to_project_id) WHERE converted_to_project_id IS NOT NULL;
