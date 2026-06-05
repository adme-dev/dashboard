# EDM Imported HTML Editing — Handoff (2026-06-05)

Continuation of the EDM Postcards builder work after imported template support.
This handoff is focused on making imported Postcards HTML blocks feel editable
inside our builder, instead of forcing every template to expose custom fields.

## Current Repo State

- Working checkout: `/Users/paulgiurin/Documents/Projects/dashboard`
- Branch: `main`
- Current HEAD: `939e5013 feat(email): import Postcards template exports`
- Prior imported-template commit included GlideX, FuturaX, and Aviro. MetaHome and the loose `Downloads/index.html` were intentionally excluded because the single-file import corrupted the mixed template set.
- There are many unrelated WIP files in this checkout. Do not stage broad paths.

## User Intent Captured

The target UX is Designmodo/Postcards-like:

- Click text/image/link inside a template and edit the specific region inline.
- The existing floating widget should appear for the selected region and expose fast actions.
- The right sidebar should switch to settings appropriate to the selected region.
- Right-click should be considered for contextual actions, especially image replacement.
- Imported templates should not require hard-coded custom field mappings for every text/image area.
- A media library is needed later, agency-wide first, with future client-specific lock-down and configurable storage/file-size guardrails.

## WIP Implemented In This Session

Uncommitted scoped files:

- `app/utils/edmHtmlEditables.ts`
- `app/components/email/builder/EdmBlockRenderer.vue`
- `app/components/email/builder/EdmFlyhubBuilder.client.vue`
- `app/components/email/builder/BlockSettingsPanel.vue`
- `app/composables/useEdmBuilder.ts`
- `test/utils/edmHtmlEditables.test.ts`
- `test/components/emailEdmHtmlEditableRenderer.test.ts`
- `test/components/emailEdmBlockSettingsPanel.test.ts`

### 1. Imported HTML Region Discovery

`app/utils/edmHtmlEditables.ts` adds a DOM-based discovery layer for raw imported
HTML content:

- Discovers editable text regions.
- Discovers links.
- Discovers images.
- Assigns stable path-based IDs such as `text:table[0]/tbody[0]/...`.
- Annotates canvas-only editor HTML with `data-edm-html-editable-*` attributes.
- Skips unsafe/non-editable nodes such as `style`, `script`, and metadata tags.
- Serializes updates back into the original `props.contents`, stripping editor-only attributes before saving.

### 2. Canvas Selection For Imported HTML Sub-Elements

`EdmBlockRenderer.vue` now annotates imported `Html` blocks only when the block is
editable in the canvas. Preview/server render paths are not supposed to receive
editor attributes.

Current behavior:

- Clicking an annotated text/link/image region selects that sub-element.
- Text/link regions are `contenteditable` on the canvas.
- Blur commits sanitized HTML back into the parent Html block.
- Selected regions receive a lightweight visual outline.

### 3. Builder Store Selection State

`useEdmBuilder.ts` now tracks `selectedHtmlEditable` alongside the selected block.
The selection is cleared when the user selects another block, clears selection,
or resets the document.

`EdmFlyhubBuilder.client.vue` bridges selected sub-elements back into block
updates:

- `selectCanvasHtmlEditable(blockId, selection)`
- `selectedHtmlEditableFor(blockId)`
- `updateSelectedHtmlEditable(update)`

Updates mutate the selected Html block's `props.contents` directly, so server
rendering does not need an override layer for this first pass.

### 4. Dynamic Sidebar Controls

`BlockSettingsPanel.vue` now shows dynamic settings when a selected Html block
has a selected imported region:

- Text: content, color, font size, alignment.
- Link: text, URL, color.
- Image: preview, image URL, alt text, link URL.

When a sub-region is selected, the raw `HTML content` textarea is hidden. This
matches the requested direction: edit the selected thing first, keep raw HTML as
a fallback when no sub-region is selected.

### 5. Selected-Region Floating Widget + Image Right-Click

`EdmBlockRenderer.vue` now renders a small floating quick-action bubble when an
imported Html sub-region is selected.

Current quick actions:

- Selected imported image: change image URL, edit image link URL.
- Selected imported link: edit link URL.

The bubble is a first pass wired to the same selected-region model as the
sidebar. It uses browser prompts until the real media library/gallery exists.

Right-click behavior:

- Right-clicking an imported Html image selects that image region.
- The native context menu is suppressed for that image.
- The same image-change path is invoked and writes back through
  `updateHtmlEditable`.

## Sanitization / Safety

The editable layer reuses the existing inline text sanitizer for text/link HTML.

Current URL rules:

- Link URLs allow `http`, `https`, `mailto:`, root-relative, dot-relative, and anchors.
- Image URLs allow `http`, `https`, root-relative, dot-relative, and safe image data URLs.
- Unsafe URLs such as `javascript:` are rejected.

This is a first-pass safety layer. Keep it strict because imported HTML content is
rendered as raw HTML.

## Verification Already Run

Red/green work was done:

- Initial test run failed before implementation because the editable util and component behavior did not exist.
- Narrow verification passed after implementation:
  - `pnpm vitest run test/utils/edmHtmlEditables.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts test/components/emailEdmBlockSettingsPanel.test.ts`
  - Result: 3 files / 15 tests passed.
- Wider EDM verification passed after implementation:
  - `pnpm vitest run test/utils/edmHtmlEditables.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts test/components/emailEdmBlockRenderer.test.ts test/components/emailEdmBlockSettingsPanel.test.ts test/utils/edmInlineText.test.ts test/utils/edmPresets.test.ts test/utils/useEdmBuilderPresets.test.ts test/components/emailEdmTemplateThumbnail.test.ts test/components/emailEdmSectionThumbnail.test.ts test/components/emailTemplatesPanel.test.ts test/app/edmBuilderStore.test.ts`
  - Result before the floating-widget increment: 11 files / 87 tests passed.
- Floating-widget/right-click verification passed after implementation:
  - `pnpm vitest run test/components/emailEdmHtmlEditableRenderer.test.ts`
  - Result: 1 file / 4 tests passed.
- Wider EDM verification passed after floating-widget/right-click implementation:
  - `pnpm vitest run test/utils/edmHtmlEditables.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts test/components/emailEdmBlockRenderer.test.ts test/components/emailEdmBlockSettingsPanel.test.ts test/utils/edmInlineText.test.ts test/utils/edmPresets.test.ts test/utils/useEdmBuilderPresets.test.ts test/components/emailEdmTemplateThumbnail.test.ts test/components/emailEdmSectionThumbnail.test.ts test/components/emailTemplatesPanel.test.ts test/app/edmBuilderStore.test.ts`
  - Result: 11 files / 89 tests passed.

Typecheck status:

- `pnpm run typecheck` OOMs at the default heap.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` reaches repo-wide
  TypeScript checking but exits non-zero on many existing unrelated errors across
  analytics/banner/advisor/server/Xero areas. Do not treat full repo typecheck as
  a clean gate until those broader errors are resolved.

## Important Caveats

- This is not committed yet.
- No real-browser Kimi verification has been done for this specific imported
  HTML editable-region pass yet.
- No media library picker is attached yet. Image editing is currently direct URL,
  alt text, and link URL only.
- The floating widget is implemented for imported Html image/link quick actions,
  but it is still prompt-based and not yet connected to a real gallery/media
  picker.
- Right-click image replacement is implemented as an accelerator for the prompt
  image-change path. Replace this with the gallery action when media library work
  lands.
- Imported HTML regions are discovered structurally from the DOM. This is dynamic
  discovery, not per-template hard-coded mapping, but very complex table/MJML
  output may still need heuristics to avoid selecting overly small or overly
  broad text nodes.

## Recommended Next Steps

1. Run a fresh focused test pass before committing:
   - `pnpm vitest run test/utils/edmHtmlEditables.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts test/components/emailEdmBlockSettingsPanel.test.ts`
2. Check formatting/diff hygiene:
   - `git diff --check`
3. Browser-check `/agency/email/compose`:
   - insert/open one imported template
   - click text inside imported Html
   - confirm inline edit commits on blur
   - confirm sidebar switches to Imported text controls
   - click image
   - confirm sidebar switches to Imported image controls
   - confirm preview/server output does not contain editor-only attributes
4. Replace prompt-based image/link quick actions with the media library/gallery
   flow once that exists.
5. Extend quick actions if product needs them:
   - text/link: duplicate, delete, alignment/list if applicable
   - image: duplicate, delete, alt text, gallery
6. Add media library roadmap item:
   - agency-wide asset library first
   - future client-scoped filtering/permissions
   - configurable max upload size, likely 200 MB default with optional 500 MB tier/settings
   - image validation, MIME allow-list, storage quota, and signed/private asset delivery decisions
7. Commit only the scoped EDM files listed above.

## Product Direction Notes

The floating widget should remain the primary quick-action UI. It is already the
visual language the builder uses for selected blocks and sections, so imported
HTML sub-regions should plug into that same component/model.

Right-click is useful as an accelerator, especially for images, but should not be
the only way to access actions. Use it to open the same menu as the widget's image
action so the behavior stays consistent.

The right sidebar should continue doing detailed settings. The bubble should be
for fast actions; the sidebar should be for precise values and advanced controls.
