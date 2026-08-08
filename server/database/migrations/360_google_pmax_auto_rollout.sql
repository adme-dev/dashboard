-- 360_google_pmax_auto_rollout.sql
-- Make the approved Google PMax brief the authoritative template -> project -> task trigger.

BEGIN;

DO $$
DECLARE
  v_project_template_id UUID;
BEGIN
  SELECT id INTO v_project_template_id
    FROM project_templates
   WHERE lower(trim(name)) = 'google pmax inventory launch'
     AND is_active = true
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_project_template_id IS NULL THEN
    RAISE EXCEPTION 'Google PMax Inventory Launch project template is missing';
  END IF;

  UPDATE brief_templates
     SET project_template_id = v_project_template_id,
         auto_convert_on_approval = true,
         updated_at = NOW()
   WHERE slug = 'google-pmax';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'google-pmax brief template is missing';
  END IF;
END $$;

COMMIT;
