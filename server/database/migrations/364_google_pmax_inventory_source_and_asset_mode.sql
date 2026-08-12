-- 364_google_pmax_inventory_source_and_asset_mode.sql
-- Bind PMax Inventory plans to one client-owned Google feed and prevent partial retail asset groups.

BEGIN;

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
    'google_feed_id',
    'XeroFlow Google Vehicle Feed',
    'dropdown',
    'Provider-backed Google feed picker. The selected active feed is revalidated against the client link and Merchant Center before approval.',
    NULL::jsonb,
    '[]'::jsonb,
    '{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"show"}'::jsonb,
    2,
    'Feed',
    'Feed',
    'full',
    2
  ),
  (
    'asset_mode',
    'Asset Mode',
    'dropdown',
    'Choose a true Merchant-only launch with no manual assets, or provide the complete provider-verified PMax asset set.',
    '"provided"'::jsonb,
    '[{"label":"Complete branded asset set","value":"provided"},{"label":"Merchant feed only","value":"merchant_only"}]'::jsonb,
    '{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"show"}'::jsonb,
    3,
    'Asset Group',
    'Assets',
    'full',
    1
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

UPDATE brief_template_fields field
   SET is_required = CASE
         WHEN field.field_key IN ('business_name', 'headlines', 'descriptions') THEN false
         ELSE field.is_required
       END,
       conditional_logic = jsonb_build_object(
         'fieldKey', 'asset_mode',
         'operator', 'equals',
         'value', 'provided',
         'action', CASE
           WHEN field.field_key IN ('business_name', 'headlines', 'descriptions') THEN 'require'
           ELSE 'show'
         END
       ),
       sort_order = CASE field.field_key
         WHEN 'asset_group_name' THEN 2
         WHEN 'final_url' THEN 3
         WHEN 'business_name' THEN 4
         WHEN 'headlines' THEN 5
         WHEN 'long_headlines' THEN 6
         WHEN 'descriptions' THEN 7
         WHEN 'images' THEN 8
         WHEN 'logos' THEN 9
         WHEN 'video_links' THEN 10
         ELSE field.sort_order
       END
  FROM brief_templates template
 WHERE field.template_id = template.id
   AND template.slug = 'google-pmax'
   AND field.field_key IN (
     'business_name', 'headlines', 'long_headlines', 'descriptions',
     'images', 'logos', 'video_links'
   );

UPDATE brief_template_fields field
   SET sort_order = 11
  FROM brief_templates template
 WHERE field.template_id = template.id
   AND template.slug = 'google-pmax'
   AND field.field_key = 'audience_signals';

COMMIT;
