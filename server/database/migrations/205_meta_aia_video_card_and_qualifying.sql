-- 205: meta-aia template enhancements (board "Items to Action" coverage gaps)
--
-- The Marketing board's live AIA campaigns frequently request:
--   1. a "+ Video Card" creative add-on  -> ad_format had no video option
--   2. a standard lead-gen qualifying-question set (purchase timeframe, trade-in,
--      model, finance, test drive) -> only a free-text lead_form_name existed
--
-- Both changes are additive and idempotent. Safe to re-run.

BEGIN;

-- 1) Append "Video / Video Card" to meta-aia ad_format (only if not already present)
UPDATE brief_template_fields f
SET options = (f.options::jsonb) || '[{"label": "Video / Video Card", "value": "video"}]'::jsonb
FROM brief_templates t
WHERE f.template_id = t.id
  AND t.slug = 'meta-aia'
  AND f.field_key = 'ad_format'
  AND NOT (f.options::jsonb @> '[{"value":"video"}]'::jsonb);

-- 2) Make room in step 5 for the new field directly after lead_form_name (Tracking, sort 8):
--    shift the three Accountability fields (sort 9,10,11) down by one. Guarded so a
--    re-run (where lead_qualifying_questions already exists) is a no-op.
UPDATE brief_template_fields f
SET sort_order = f.sort_order + 1
FROM brief_templates t
WHERE f.template_id = t.id
  AND t.slug = 'meta-aia'
  AND f.step_number = 5
  AND f.field_key IN ('acct_accountable_owner', 'acct_compliance_ack', 'acct_approval_required')
  AND NOT EXISTS (
    SELECT 1 FROM brief_template_fields g
    WHERE g.template_id = t.id AND g.field_key = 'lead_qualifying_questions'
  );

-- 3) Insert the qualifying-questions field (shown only when objective = leads).
--    Standard set is pre-selected via default_value per the team's lead-gen SOP.
INSERT INTO brief_template_fields
  (template_id, field_key, field_label, field_type, placeholder, help_text, default_value,
   is_required, validation_rules, options, conditional_logic,
   step_number, step_title, section, width, sort_order, show_in_preview, show_in_list)
SELECT
  t.id,
  'lead_qualifying_questions',
  'Lead Qualifying Questions',
  'checkboxgroup',
  NULL,
  'Qualifiers appended to the Meta instant lead form. Default set balances volume vs quality; deselect/add as the client requires.',
  '["purchase_timeframe","trade_in","model_of_interest","finance_required","test_drive"]'::jsonb,
  false,
  NULL,
  '[{"label":"Purchase timeframe","value":"purchase_timeframe"},{"label":"Trade-in?","value":"trade_in"},{"label":"Model of interest","value":"model_of_interest"},{"label":"Finance required?","value":"finance_required"},{"label":"Test drive?","value":"test_drive"}]'::jsonb,
  '{"value":"leads","action":"show","fieldKey":"objective","operator":"equals"}'::jsonb,
  5,
  'Offer & Accountability',
  'Tracking',
  'full',
  9,
  false,
  false
FROM brief_templates t
WHERE t.slug = 'meta-aia'
  AND NOT EXISTS (
    SELECT 1 FROM brief_template_fields g
    WHERE g.template_id = t.id AND g.field_key = 'lead_qualifying_questions'
  );

COMMIT;
