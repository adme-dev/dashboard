-- 164: EDM template folders + drafts (Phase 1b)
-- Additive metadata only; existing templates remain reusable templates with no folder.
ALTER TABLE edm_templates
  ADD COLUMN IF NOT EXISTS template_kind TEXT NOT NULL DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS folder_name TEXT;

ALTER TABLE edm_templates
  DROP CONSTRAINT IF EXISTS edm_templates_template_kind_check;

ALTER TABLE edm_templates
  ADD CONSTRAINT edm_templates_template_kind_check
  CHECK (template_kind IN ('template', 'draft'));

CREATE INDEX IF NOT EXISTS idx_edm_templates_kind_folder
  ON edm_templates(template_kind, folder_name, updated_at DESC);
