# Brief-Template Audit Rubric (2026-06-23)

Audit each existing `brief_templates` template against this rubric to feed brief-template
field-design improvements + gap-filling. Context: ADME = digital marketing agency for **car
dealerships**. Job-type taxonomy: `docs/superpowers/research/2026-06-23-monday-job-types.md`.

## How to pull a template's fields (per template)
```
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
psql "$DATABASE_URL" -tA -c "SELECT field_label,'|',field_type,'|',is_required,'|',section,'|',COALESCE(options,'') FROM brief_template_fields WHERE template_id=(SELECT id FROM brief_templates WHERE name='<NAME>') ORDER BY sort_order"
```
Available field types: text, textarea, richtext, dropdown, multiselect, checkboxgroup, radio,
url, number, currency, date, daterange, files, client, heading (section break). Field props
include: is_required, options, placeholder, help_text, validation_rules, conditional_logic,
section, width, step_number, show_in_preview, show_in_list.

## Per-template assessment dimensions
1. **Coverage** — does it capture what this job actually needs (per the Monday taxonomy / real agency practice)? List MISSING fields.
2. **Bloat / redundancy** — fields that are unnecessary, duplicated, or better merged.
3. **Field-type fit** — is each field the right type? (e.g. budget→currency, dates→date/daterange, multi-pick→checkboxgroup/multiselect not textarea, URLs→url, locations→structured not freetext where it matters).
4. **Required-flag sanity** — over-required (friction) or under-required (missing must-haves).
5. **Automotive-specifics** — does this job need dealer fields it lacks? e.g. **stock/inventory feed URL**, **VFACTS class / offer disclaimer**, **drive-away vs EGC pricing**, **OEM co-op / brand-compliance**, **dealer location(s)**, **finance/comparison-rate disclaimer**.
6. **UX structure** — opportunities for sections (heading), steps (is_multi_step), or conditional_logic (show fields only when relevant).
7. **Template-level flags** — should it set `requires_quote`, `auto_convert_on_approval`, `auto_assign_to`, `default_priority`, `require_client_link`?

## Output per template (concise)
- **Verdict:** KEEP-AS-IS / MINOR-TWEAKS / SIGNIFICANT-REWORK.
- **Top changes** (bullet list, prioritized): add/remove/retype/require, with the exact field_label + field_type.
- **Automotive gaps** (if any).

Keep evidence tight — field lists go in the doc, not prose.
