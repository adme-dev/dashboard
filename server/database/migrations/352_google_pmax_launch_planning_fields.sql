-- 352_google_pmax_launch_planning_fields.sql
-- Provider-backed PMax planning selections and durable approved-brief revisions.

BEGIN;

ALTER TABLE briefs
  ADD COLUMN IF NOT EXISTS launch_config_version INTEGER NOT NULL DEFAULT 1
  CHECK (launch_config_version > 0);
ALTER TABLE briefs
  ADD COLUMN IF NOT EXISTS has_ever_been_approved BOOLEAN NOT NULL DEFAULT false;

UPDATE briefs
   SET has_ever_been_approved = true
 WHERE status = 'approved'
    OR EXISTS (
      SELECT 1 FROM brief_activities activity
       WHERE activity.brief_id = briefs.id
         AND activity.activity_type = 'approved'
    );

INSERT INTO brief_template_fields
  (template_id, field_key, field_label, field_type, placeholder, help_text, default_value,
   is_required, validation_rules, options, conditional_logic,
   step_number, step_title, section, width, sort_order, show_in_preview, show_in_list)
SELECT
  template.id,
  field.field_key,
  field.field_label,
  field.field_type,
  NULL,
  field.help_text,
  field.default_value,
  false,
  NULL,
  field.options,
  field.conditional_logic,
  field.step_number,
  field.step_title,
  field.section,
  field.width,
  field.sort_order,
  true,
  false
FROM brief_templates template
CROSS JOIN (VALUES
  (
    'google_connection_id',
    'Google Ads Account',
    'dropdown',
    'Provider-backed account picker completed in Google PMax launch planning before approval. The selected connection is revalidated during read-only preflight.',
    NULL::jsonb,
    '[]'::jsonb,
    '{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"show"}'::jsonb,
    1,
    'Setup',
    'Basics',
    'full',
    6
  ),
  (
    'inventory_condition',
    'Inventory Condition',
    'dropdown',
    'Choose which Merchant Center vehicle conditions are eligible.',
    '"NEW"'::jsonb,
    '[{"label":"New","value":"NEW"},{"label":"Used","value":"USED"},{"label":"New and used","value":"ALL"}]'::jsonb,
    '{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"require"}'::jsonb,
    2,
    'Feed',
    'Feed',
    'half',
    4
  ),
  (
    'conversion_action_ids',
    'Conversion Actions',
    'multiselect',
    'Provider-backed conversion action picker completed in Google PMax launch planning before approval. Names and health are read back before approval.',
    NULL::jsonb,
    '[]'::jsonb,
    '{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"show"}'::jsonb,
    4,
    'Budget & Geo',
    'Measurement',
    'full',
    11
  )
) AS field(
  field_key, field_label, field_type, help_text, default_value, options,
  conditional_logic, step_number, step_title, section, width, sort_order
)
WHERE template.slug = 'google-pmax'
ON CONFLICT (template_id, field_key) DO UPDATE SET
  field_label = EXCLUDED.field_label,
  field_type = EXCLUDED.field_type,
  help_text = EXCLUDED.help_text,
  default_value = EXCLUDED.default_value,
  options = EXCLUDED.options,
  conditional_logic = EXCLUDED.conditional_logic,
  step_number = EXCLUDED.step_number,
  step_title = EXCLUDED.step_title,
  section = EXCLUDED.section,
  width = EXCLUDED.width,
  sort_order = EXCLUDED.sort_order;

CREATE OR REPLACE FUNCTION bump_approved_brief_launch_config_version()
RETURNS TRIGGER AS $$
DECLARE
  target_brief_id UUID;
BEGIN
  target_brief_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.brief_id ELSE NEW.brief_id END;
  IF TG_OP = 'UPDATE'
    AND OLD.field_id IS NOT DISTINCT FROM NEW.field_id
    AND OLD.value IS NOT DISTINCT FROM NEW.value THEN
    RETURN NEW;
  END IF;
  UPDATE briefs AS brief
     SET launch_config_version = launch_config_version + 1
   WHERE brief.id = target_brief_id
     AND brief.has_ever_been_approved;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_brief_field_values_launch_config_version
  ON brief_field_values;
CREATE TRIGGER trg_brief_field_values_launch_config_version
  AFTER INSERT OR UPDATE OR DELETE ON brief_field_values
  FOR EACH ROW EXECUTE FUNCTION bump_approved_brief_launch_config_version();

CREATE OR REPLACE FUNCTION bump_approved_brief_identity_launch_config_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.has_ever_been_approved
    AND (OLD.client_id IS DISTINCT FROM NEW.client_id OR OLD.template_id IS DISTINCT FROM NEW.template_id) THEN
    NEW.launch_config_version := OLD.launch_config_version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_brief_identity_launch_config_version
  ON briefs;
CREATE TRIGGER trg_brief_identity_launch_config_version
  BEFORE UPDATE OF client_id, template_id ON briefs
  FOR EACH ROW EXECUTE FUNCTION bump_approved_brief_identity_launch_config_version();

CREATE OR REPLACE FUNCTION track_brief_approval_revision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    IF OLD.has_ever_been_approved THEN
      NEW.launch_config_version := NEW.launch_config_version + 1;
    END IF;
    NEW.has_ever_been_approved := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_brief_approval_revision
  ON briefs;
CREATE TRIGGER trg_brief_approval_revision
  BEFORE UPDATE OF status ON briefs
  FOR EACH ROW EXECUTE FUNCTION track_brief_approval_revision();

COMMIT;
