-- 361_google_pmax_budget_contract.sql
-- Make Google PMax fixed-flight budget semantics explicit while preserving
-- the existing PMax Standard daily-budget workflow.
--
-- Existing daily_budget fields and brief values are retained for compatibility. They
-- are never copied into allocated_total because a legacy daily value is ambiguous and
-- must not become a Google CUSTOM_PERIOD lifetime total.

BEGIN;

INSERT INTO brief_template_fields
  (template_id, field_key, field_label, field_type, placeholder, help_text, default_value,
   is_required, validation_rules, options, conditional_logic,
   step_number, step_title, section, width, sort_order, show_in_preview, show_in_list)
SELECT
  t.id,
  field.field_key,
  field.field_label,
  field.field_type,
  field.placeholder,
  field.help_text,
  field.default_value,
  field.is_required,
  field.validation_rules,
  field.options,
  field.conditional_logic,
  4,
  'Budget & Geo',
  'Budget',
  field.width,
  field.sort_order,
  true,
  false
FROM brief_templates t
CROSS JOIN (VALUES
  (
    'budget_period',
    'Budget Period',
    'dropdown',
    NULL::text,
    'Fixed flights use the approved total allocation for the whole date range.',
    '"fixed_flight"'::jsonb,
    true,
    NULL::jsonb,
    '[{"label":"Fixed flight — total budget","value":"fixed_flight"}]'::jsonb,
    NULL::jsonb,
    'half',
    1
  ),
  (
    'allocated_total',
    'Approved Total Allocation',
    'currency',
    '0.00',
    'Approved media allocation for the full flight. Do not enter management fees or a daily pace.',
    NULL::jsonb,
    false,
    '{"min":0.01}'::jsonb,
    '[]'::jsonb,
    '{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"require"}'::jsonb,
    'half',
    2
  ),
  (
    'budget_currency',
    'Budget Currency',
    'dropdown',
    NULL::text,
    'Validated against the selected Google Ads account before launch.',
    '"AUD"'::jsonb,
    true,
    NULL::jsonb,
    '[{"label":"Australian dollar (AUD)","value":"AUD"}]'::jsonb,
    NULL::jsonb,
    'half',
    3
  )
) AS field(
  field_key, field_label, field_type, placeholder, help_text, default_value,
  is_required, validation_rules, options, conditional_logic, width, sort_order
)
WHERE t.slug = 'google-pmax'
ON CONFLICT (template_id, field_key) DO UPDATE SET
  field_label = EXCLUDED.field_label,
  field_type = EXCLUDED.field_type,
  placeholder = EXCLUDED.placeholder,
  help_text = EXCLUDED.help_text,
  default_value = EXCLUDED.default_value,
  is_required = EXCLUDED.is_required,
  validation_rules = EXCLUDED.validation_rules,
  options = EXCLUDED.options,
  conditional_logic = EXCLUDED.conditional_logic,
  step_number = EXCLUDED.step_number,
  step_title = EXCLUDED.step_title,
  section = EXCLUDED.section,
  width = EXCLUDED.width,
  sort_order = EXCLUDED.sort_order,
  show_in_preview = EXCLUDED.show_in_preview,
  show_in_list = EXCLUDED.show_in_list;

UPDATE brief_template_fields f
SET field_label = 'Legacy Daily Budget',
    help_text = 'Compatibility field for existing briefs only. It is not the approved total and is never used as a CUSTOM_PERIOD provider amount.',
    is_required = false,
    sort_order = 4
FROM brief_templates t
WHERE f.template_id = t.id
  AND t.slug = 'google-pmax'
  AND f.field_key = 'daily_budget';

UPDATE brief_template_fields field
SET is_required = FALSE,
    conditional_logic = '{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"require"}'::jsonb
FROM brief_templates template
WHERE field.template_id = template.id
  AND template.slug = 'google-pmax'
  AND field.field_key = 'budget_period';

UPDATE brief_template_fields field
SET field_label = 'Daily Budget (Standard / legacy)',
    help_text = 'Required for PMax Standard. For Inventory fixed flights this is compatibility-only and is never converted into a total allocation.',
    is_required = FALSE,
    conditional_logic = '{"fieldKey":"pmax_type","operator":"equals","value":"standard","action":"require"}'::jsonb
FROM brief_templates template
WHERE field.template_id = template.id
  AND template.slug = 'google-pmax'
  AND field.field_key = 'daily_budget';

UPDATE brief_template_fields f
SET is_required = false,
    conditional_logic = '{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"require"}'::jsonb,
    help_text = 'Required for Inventory fixed flights. Campaign days include both the start and end date.',
    sort_order = 10
FROM brief_templates t
WHERE f.template_id = t.id
  AND t.slug = 'google-pmax'
  AND f.field_key = 'end_date';

UPDATE brief_template_fields f
SET sort_order = ordering.sort_order
FROM brief_templates t
JOIN (VALUES
  ('bidding', 5),
  ('target_cpa_roas', 6),
  ('locations', 7),
  ('languages', 8),
  ('start_date', 9)
) AS ordering(field_key, sort_order) ON true
WHERE f.template_id = t.id
  AND t.slug = 'google-pmax'
  AND f.field_key = ordering.field_key;

COMMIT;
