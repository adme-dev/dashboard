# Page Studio Phase 3: Canonical Components and Templates

## Objective

Give Page Studio a curated, maintainable library of reusable website sections, page layouts, site shells, and complete site starters without creating a second document model or coupling published websites to mutable templates.

## Product decisions

- Phase 3 ships XeroFlow-curated presets only.
- Tenant-created and marketplace templates are deferred until the canonical contracts have production evidence.
- Applying a preset copies canonical content into the current draft with fresh identifiers.
- Inserted content becomes ordinary editable Page Studio content and has no runtime dependency on the source preset.
- Template operations affect only the mutable draft. Review, approval, immutable checkpoint, build verification, and release activation remain unchanged.

## Canonical section model

The existing `PageStudioBlock` remains the unit of page composition. Its discriminated section types expand from hero, text, image, and call-to-action to include:

- Features
- Statistics
- Testimonials
- Frequently asked questions
- Contact
- Logo cloud
- Blog grid

All section types retain the shared presentation fields for eyebrow, heading, body, button, image, alignment, and background. Collection-based sections add a bounded `items` array with canonical item fields: identifier, title, body, label, value, image URL, image alternative text, and link. Unused fields remain empty rather than producing section-specific document shapes.

The schema enforces limits on item count and text length. Existing documents remain valid because new fields are optional and existing section types are unchanged.

## Site shell model

The revisioned Page Studio document gains an optional `shell` object containing:

- Header preset identifier
- Footer preset identifier
- Site name
- Primary action label and destination
- Header navigation items
- Footer navigation groups
- Copyright text

Page-level header and footer inheritance modes from Phase 2 remain authoritative. An inherited page renders the document shell, a hidden mode omits that shell region, and a custom mode is reserved for a future page-local shell editor while falling back safely to the inherited shell in Phase 3.

## Curated registry

The registry is versioned TypeScript data in shared Page Studio code and has no database dependency. Every entry has a stable identifier, category, name, description, preview metadata, and factory that creates fresh document identifiers.

Initial section presets:

- Editorial hero
- Conversion hero
- Split image story
- Service feature grid
- Proof statistics
- Customer testimonials
- Frequently asked questions
- Contact callout
- Partner logo cloud
- Article grid
- Closing call-to-action

Initial page layouts:

- Landing page
- Service page
- Contact page
- Campaign page
- Blog index

Initial shell presets:

- Minimal
- Standard navigation
- Campaign
- Compact footer
- Multi-column footer
- Conversion footer

Initial complete site starters:

- Professional services
- Local business
- Campaign microsite

## Studio experience

Studio receives a permanent Library action beside Add section. The library opens a Nuxt UI slideover with Sections, Pages, Shells, and Sites tabs.

- Section selection inserts the preset after the selected section, or at the end when no section is selected.
- Page layout selection replaces only the selected page's blocks after a Nuxt UI confirmation modal.
- Header or footer selection updates only the matching shell configuration.
- Complete site selection replaces the draft pages and shell after confirmation.
- Site starters are disabled when their page count exceeds the active entitlement.
- Applying a site starter preserves document schema version and replaces redirects with the starter's explicit redirect set, which is empty initially.
- Save remains explicit. Closing or navigating away before saving leaves the server draft unchanged.

The library uses the existing XeroFlow visual language, Nuxt UI v4 controls, semantic colours, responsive layout, keyboard-accessible actions, loading states, and meaningful empty/error states.

## Rendering

`BuilderCanvas` renders the selected header above page blocks and the selected footer below them. Each new section type receives a deterministic responsive renderer using the same document data on desktop, tablet, and mobile previews.

No preset includes executable markup, arbitrary CSS, or user-supplied component code. URLs continue through the existing string schema and browser rendering boundaries.

## Data flow

1. Studio loads the tenant-scoped revisioned document through the existing document endpoint.
2. The operator chooses a curated preset from the local versioned registry.
3. A pure factory creates new UUIDs and returns canonical blocks, pages, or shell metadata.
4. Studio applies the result only to its in-memory draft.
5. The existing save endpoint validates the complete document, checks the entitlement page limit and expected revision, persists atomically, and records the audit event.
6. Existing checkpoint, review, publishing, and release metadata flows consume the saved document without bypasses.

## Error handling

- Invalid preset identifiers fail closed and do not mutate the draft.
- Page-limit violations disable site starters before application and remain server-enforced at save time.
- Schema-invalid preset output is rejected by tests and by the save endpoint.
- Revision conflicts retain the current failure behaviour and require a reload before retrying.
- Replacement operations require confirmation and are not applied when cancelled.

## Testing

- Registry tests validate every preset against the shared document schema.
- Factory tests prove fresh identifiers are generated for repeated applications.
- Composition tests cover section insertion, page replacement, shell replacement, complete-site replacement, and page limits.
- Renderer contract tests cover every canonical section and shell type.
- Studio UI tests require Nuxt UI controls, all library categories, and confirmation boundaries.
- The complete Page Studio test surface, scoped lint, changed-file typecheck diagnostics, production Worker build, and deployment target guard remain release gates.

## Deferred scope

- Tenant-created reusable templates
- Marketplace and cross-tenant sharing
- Template updates propagating into already-created pages
- Arbitrary HTML, CSS, JavaScript, or third-party component execution
- AI-generated templates, which belong to the governed AI builder phase
