# CMS email builder — Vehicle Marketplace reference

Reviewed locally on 1 October 2026 following Paul's reference to
`/Users/paulgiurin/Documents/GitHub/vehicle-marketplace`.
Read-only inspection; that repository has unrelated dependency edits which were
not modified. This is a source-code comparison, not browser or delivery acceptance
of Vehicle Marketplace.

## Implementation references

- `frontend/app/components/settings/SettingsInquiryEmailTemplate.vue`: compact
  block editor, block palette, drag handles plus move buttons, named template
  selection, media picker, variable hints, debounced preview and desktop/mobile mode.
- `frontend/app/pages/dashboard/settings/inquiry-email.vue`: dedicated settings entry.
- `frontend/server/utils/email/confirmation-template.ts`: renderer entry referenced
  by the config and preview; inspect in depth before reusing renderer logic.
- `frontend/server/utils/email/inquiry-email-config.ts`: named dealer templates,
  default selection, routed-template fallback and branding/contact loaders.
- `frontend/app/pages/dashboard/settings/templates.vue`: a separate plain-text
  response-snippet library; distinct from the visual confirmation-email builder.

The older 16 June design spec says fixed layout and one template. Current source
has multiple named templates and reorderable blocks; use the inspected source
as the evidence for its current UI, not that older scope description.

## Adoption decisions

| Reference pattern | CMS adaptation |
| --- | --- |
| Compact icon-labelled block palette | Replace the New block select/Add pair with direct actions for supported blocks. Keep Nuxt UI controls and accessible labels. |
| Reorderable block cards | Keep existing up/down controls and undo; add drag handles only with keyboard/touch acceptance. |
| Preview refreshes after edits | Add debounced preview with stale-response protection and cancellation on unmount; preserve the sandbox/CSP and synthetic answers. Keep an explicit refresh/retry action. |
| Header/image/banner media picker | Use customer-owned site media IDs and authenticated safe previews. Image schema, asset authority and delivery references must be implemented before exposing these controls. |
| Named designs and default selection | Follow website defaults → explicit shared-form override → reset to default. A placement does not create another form/template configuration. Named libraries are a later extension. |
| Business branding and footer | Offer reusable website branding/contact details once customer-owned values are defined; avoid dealer-specific records. |
| Vehicle/contact cards | Treat as future schema-backed industry blocks (product, booking, enquiry summary); do not copy automotive assumptions into the generic CMS. |

The reference uses shadcn/raw controls and dealer-scoped mutable records. Adapt its
interaction patterns to Nuxt UI v4, immutable customer revisions, scope/audience
validation and explicit saves. Keep the CMS preview sandbox and strict document
schema. The reference's sending toggle does not justify exposing delivery controls
before verified sender/routing/outbox acceptance. AI should propose the same
structured document and require Apply, leaving manual editing available.

## Next bounded implementation

1. Simplify the current template editor with the compact supported-block palette
   and debounced safe preview, retaining undo/redo and conflict protection.
2. Add explicit shared-form template overrides and reset-to-default with effective
   design preview and an impact summary.
3. Add customer media blocks, then AI proposals against the approved schema.
4. Complete sender/routing/outbox and hosted acceptance separately.

This reference is incorporated into the active checklist. Website template drafts
are already locally verified; these additional UX/media/override features are
not marked complete until implemented and tested.
