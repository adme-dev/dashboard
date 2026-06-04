# EDM Postcards Builder Design

## Summary

Rework the existing `/agency/email` EDM builder into a Postcards-style creation surface while preserving the current Flyhub document model, server rendering path, and from-scratch block workflow.

The first implementation slice should deliver a usable editor shell with:

- A Postcards-like top toolbar with undo, redo, save, preview, HTML, and campaign/template context.
- A left module browser with section categories: Basic, Header, Content, Feature, Call to action, E-Commerce, Transactional, and Footer.
- A thumbnail rail for ready-to-insert sections inside the active category.
- The existing central 600px email canvas.
- The existing right inspector, extended only where needed for newly surfaced section types.
- A template gallery entry point that supports blank creation and curated starter templates.

## Current Context

The repo already has an EDM builder at `/agency/email/compose`:

- `app/components/email/builder/EdmFlyhubBuilder.client.vue` owns the editor shell.
- `app/composables/useEdmBuilder.ts` owns the singleton client-side document state.
- `app/types/edm.ts` defines the flat Flyhub-style document map.
- `app/utils/edmBlocks.ts` defines the current basic block palette.
- `server/utils/email-marketing/render/*` renders the saved `body_source` document to email-safe HTML.
- `server/utils/email-marketing/templates.ts` persists templates and regenerates `body_html`.

The server renderer already registers richer section-like block types such as `header`, `menu`, `hero-section`, `feature-grid`, `cta-banner`, `footer`, `testimonial`, `review-stars`, `next-steps`, `countdown-timer`, and `social`, but the current editor palette and client-side preview only expose simple primitive blocks.

## Goals

1. Make `/agency/email/compose` feel close to the Designmodo Postcards builder: module categories, section thumbnails, canvas-first editing, and compact inspector controls.
2. Keep scratch-building available through Basic blocks.
3. Add a curated starter library of insertable sections and full-email templates without changing the saved document schema.
4. Keep rendered output compatible with the existing server renderer and campaign/template persistence.
5. Keep the first slice scoped enough to test: no drag-and-drop reordering, no collaborative editing, no remote template marketplace.

## Non-Goals

- Cloning Designmodo branding, proprietary templates, or exact visual assets.
- Replacing the Flyhub document format.
- Building a full asset manager or media library.
- Adding database tables for system presets in the first slice.
- Adding visual drag-and-drop between the left rail and the canvas in the first slice.

## Architecture

Presets should be local TypeScript data that produce normal `EdmFlyhubDocument` blocks. A preset insertion expands into one or more concrete blocks with generated IDs and appends them to `root.childrenIds`.

This avoids a new persistence model. Once inserted, a preset becomes normal editor state and saves exactly like any manually-built email. Existing saved templates remain compatible.

Recommended structure:

- `app/utils/edmBlocks.ts`: keep the primitive block palette and add richer supported block metadata if needed.
- `app/utils/edmPresets.ts`: define section categories, section preset factories, full template factories, and helper functions to clone/generate IDs.
- `app/composables/useEdmBuilder.ts`: add `insertBlocks`, `insertSectionPreset`, and `setTemplatePreset` style actions that preserve history and document integrity.
- `app/components/email/builder/EdmFlyhubBuilder.client.vue`: split the large shell into smaller panels if needed, but keep behavior centralized for the first slice.
- `app/components/email/builder/EdmBlockRenderer.vue`: add client-side previews for surfaced custom block types that already render server-side.
- `app/components/email/TemplatesPanel.vue`: evolve from a list into a visual gallery with a blank card and saved-template cards.

## Builder Experience

### Top Toolbar

The toolbar should feel like Postcards:

- Left: template/campaign name and unsaved-state indicator.
- Center-left: plus/module affordance, undo, redo.
- Center: Editor, Preview, HTML mode buttons.
- Right: campaign/template context badge and Save.

The current save behavior stays intact:

- `?campaign=<id>` patches campaign content.
- `?id=<templateId>` patches template content.
- new compose saves a template after collecting name, subject, and preview text.

### Left Module Browser

The left panel should have two levels:

1. Category list with icons and labels.
2. Thumbnail rail showing presets for the active category.

Categories:

- Basic: Heading, Text, Button, Image, Avatar, Divider, Spacer, HTML, Columns, Container.
- Header: logo header, logo plus nav, dark brand header.
- Content: article intro, two-card blog posts, logo grid, editorial image block.
- Feature: icon feature grid, product feature split, testimonial quote.
- Call to action: centered CTA, dark CTA, countdown offer.
- E-Commerce: product feature, offer block, cart/order summary style section.
- Transactional: next steps, status update, confirmation message.
- Footer: legal footer, social footer, unsubscribe footer.

Basic items add single primitive blocks. Section items insert composed block fragments or a single existing custom section block.

### Canvas

Keep the 600px centered canvas and selected-block wrappers. Improve empty state language to support both workflows:

> Add a section from the left panel or start from Basic blocks.

Existing block actions remain:

- select
- move up/down
- duplicate
- delete
- insert above/below

### Inspector

The current inspector remains the right panel. It should support:

- existing primitive block settings
- section block settings for newly surfaced server-rendered block types
- root layout settings when no block is selected

First-slice section settings should stay minimal:

- header: logo URL, tagline, alignment, background color
- menu: nav item labels/URLs, separator, text color
- hero-section: image URL, heading, subheading, CTA text/URL, overlay, text color
- feature-grid: item headings/descriptions/icons, columns, icon color
- cta-banner: heading, subheading, CTA text/URL, colors
- footer: additional text, show unsubscribe, background color

## Template Gallery

The current `EmailTemplatesPanel` should become a more visual gallery:

- Blank template card.
- Saved templates displayed as cards with name, subject, updated date, and actions.
- Starter template cards sourced from local preset data.
- Filters can be presentational in the first slice: Usage and Style are enough.

Selecting a starter template should open the composer with that preset loaded client-side. To avoid new APIs, the first slice can pass a query param such as `?starter=newsletter-digest`; the composer maps that ID to a local full-document preset.

## Data Flow

1. User opens `/agency/email`.
2. Templates tab shows saved templates plus local starters.
3. User selects blank, saved template, starter template, or campaign compose.
4. Composer initializes `useEdmBuilder`:
   - saved template/campaign: load existing `body_source`
   - starter: create preset document
   - blank: `createEmptyDocument()`
5. User inserts sections/basic blocks into the flat document.
6. Preview/HTML calls `/api/email/templates/render`.
7. Save persists unchanged `body_source` via existing campaign/template endpoints.

## Testing

Unit tests should cover pure preset behavior:

- section preset insertion produces a valid Flyhub document
- generated IDs are unique and present in `root.childrenIds`
- starter templates are valid `EmailLayout` documents
- all preset block types are registered or renderer-compatible

Renderer tests should cover at least one document using custom section block types:

- header + menu + hero-section + feature-grid + cta-banner + footer render without unknown-block fallback markup
- output includes expected copy and links

Component-level tests can stay light because the app currently relies mostly on utility/server tests. The first implementation should at minimum run:

- `pnpm test:run test/utils/emailRenderDocument.test.ts test/utils/emailRenderHeading.test.ts test/utils/emailRenderMerge.test.ts test/utils/emailMarketingEmail.test.ts test/utils/emailCampaignFormat.test.ts`
- new preset/render tests added for this feature

## Risks

- The server uses lowercase custom block type names (`hero-section`, `cta-banner`) while the current primitive palette uses PascalCase names (`Heading`, `Text`). Preset metadata must use the exact renderer type.
- Client preview currently handles only primitive leaf blocks plus container/columns. New section types need client preview implementations or they will show as unknown in the editor even if server preview works.
- Some existing server block renderers reference optional dealer context fields. Presets should avoid relying on that context and provide explicit props.
- The composer file is already fairly large. If implementation makes it harder to reason about, split panel components during the feature instead of adding all UI inline.

## Approved Direction

Use the Postcards-style shell approach:

- emulate the module/category/sidebar/canvas/inspector pattern
- keep basic from-scratch blocks
- add curated section and starter template presets
- preserve the current persistence and rendering architecture
