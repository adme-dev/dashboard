# EDM Imported HTML Editing — Handoff (2026-06-05)

Continuation handoff for the EDM/Postcards builder work in
`/Users/paulgiurin/Documents/Projects/dashboard`.

## Repo State

- Branch: `main`
- Current shipped commit: `66801771 feat(email): add editable imported HTML regions`
- Prior template-import commits brought in GlideX, FuturaX, and Aviro; MetaHome and
  the loose `Downloads/index.html` were intentionally excluded after the single
  HTML import corrupted the mixed template set.
- The checkout contains many unrelated WIP files. Stage only the scoped email
  builder/media-library files listed below.

## What Is Completed

### Imported HTML Region Editing

Committed in `66801771`:

- `app/utils/edmHtmlEditables.ts`
  - Discovers text, link, and image regions dynamically from imported raw HTML.
  - Discovers Postcards table-cell background images from `background` and
    `background-image:url(...)` attributes without hiding nested text editables.
  - Uses path-based IDs instead of hard-coded template field mappings.
  - Annotates canvas-only HTML with `data-edm-html-editable-*` attributes.
  - Strips editor-only attributes before persisting/rendering.
  - Sanitizes inline text/link HTML and rejects unsafe link/image URLs.
- `app/components/email/builder/EdmBlockRenderer.vue`
  - Lets users click imported text/link/image regions.
  - Enables inline `contenteditable` editing for imported text/link regions.
  - Shows the existing floating widget for selected imported regions.
  - Shows a compact formatting toolbar for selected imported text/link regions
    with font family, size, weight, alignment, and color controls.
  - Adds selected-region duplicate and delete actions. For nested imported
    table designs, both actions prefer the nearest repeated row/list item so
    benefit rows clone/remove with their icon plus copy instead of acting only
    on a text span.
  - Supports right-click on imported images as an image-replacement accelerator.
  - Supports imported background-image regions through the same image quick
    action and image-library request path as normal `<img>` tags.
- `app/components/email/builder/BlockSettingsPanel.vue`
  - Switches from raw HTML settings to selected-region settings.
  - Shows text, link, or image controls based on the selected imported region.
- `app/composables/useEdmBuilder.ts` and `EdmFlyhubBuilder.client.vue`
  - Track `selectedHtmlEditable` alongside selected block state.
  - Route selected-region updates back into the parent Html block contents.

### Browser Verification

Kimi WebBridge was restarted and connected after the web bridge came back.
Real-browser checks were run against:

`http://localhost:3000/agency/email/compose?starter=postcards-glidex`

Confirmed:

- Imported GlideX template loads in the composer.
- Imported image click selects an image sub-region.
- Floating widget appears for selected imported image regions.
- Sidebar switches to imported image controls.
- Right-click image replacement dispatches the image-change path.
- Imported text click selects a text sub-region.
- Sidebar switches to imported text controls.
- Selected imported text now shows the quick formatting toolbar instead of an
  empty region bubble.
- Imported background images are now selectable/editable as image regions.
- Selected imported rows/items can now be duplicated or deleted from the region
  toolbar.

### Media Library Picker WIP

Currently uncommitted scoped work:

- `app/utils/edmImageAssets.ts`
  - Defines image MIME allow-list: JPEG, PNG, GIF, WebP.
  - Defines default max upload size: 200 MB.
  - Formats asset sizes.
  - Sanitizes email asset storage filenames.
  - Normalizes asset URLs so local upload paths with spaces/# characters are safe
    for imported HTML image updates.
- `server/api/agency/email/assets/index.get.ts`
  - Authenticated agency-wide image asset list endpoint.
  - Reads existing `banner_assets`.
  - Filters to allowed raster image MIME types.
  - Supports search and returns newest 120 assets.
- `server/api/agency/email/assets/upload.post.ts`
  - Write-protected image upload endpoint.
  - Validates allowed MIME types and the 200 MB default cap.
  - Stores through existing banner asset R2/local storage.
  - Tags uploaded assets with `email` and `image`.
- `app/components/email/builder/EdmImageLibraryPicker.vue`
  - Right-side image library slideover.
  - Searches image assets.
  - Shows image cards with thumbnails and file size.
  - Uploads new images and immediately applies the uploaded asset.
- `app/components/email/builder/EdmBlockRenderer.vue`
  - Emits `request:html-image-library` instead of opening a prompt when the
    image library integration is enabled.
  - Keeps prompt fallback for disabled/non-library contexts.
  - Requests the image library for both inline `<img>` and background-image
    imported regions.
- `app/components/email/builder/EdmFlyhubBuilder.client.vue`
  - Opens the image library from imported image quick actions/right-click.
  - Applies the selected image asset back to the selected imported image region.

## Verification Already Run

For committed imported HTML editing:

- Focused pass: 3 files / 15 tests passed.
- Wider EDM pass: 11 files / 89 tests passed.
- Kimi browser checks confirmed imported text/image selection and sidebar mode.

For media-library/text-toolbar/background-image WIP before this handoff update:

- Red test pass failed before the picker/util existed and before image-library
  emission replaced prompt behavior.
- Focused green pass: 3 files / 9 tests passed.
- Wider EDM/media pass: 13 files / 94 tests passed.
- Latest regression pass after imported text/background-image fixes:
  - `pnpm vitest run test/utils/edmHtmlEditables.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts`
  - Result: 2 files / 12 tests passed.
- Latest wider pass:
  - `pnpm vitest run test/utils/edmImageAssets.test.ts test/utils/edmHtmlEditables.test.ts test/components/emailEdmImageLibraryPicker.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts test/components/emailEdmBlockRenderer.test.ts test/components/emailEdmBlockSettingsPanel.test.ts test/utils/edmInlineText.test.ts test/utils/edmPresets.test.ts test/utils/useEdmBuilderPresets.test.ts test/components/emailEdmTemplateThumbnail.test.ts test/components/emailEdmSectionThumbnail.test.ts test/components/emailTemplatesPanel.test.ts test/app/edmBuilderStore.test.ts`
  - Result after duplicate/delete-region actions: 13 files / 103 tests passed.
- `git diff --check` passed.

Typecheck status:

- `pnpm run typecheck` OOMs at the default heap.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` reaches checking
  but exits non-zero on existing unrelated repo-wide TypeScript errors across
  analytics/banner/advisor/server/Xero areas.

## Current Caveats

- The image library is agency-wide only. Client-specific library scoping remains
  a roadmap item.
- Upload quota/settings are fixed at 200 MB in this pass. Future settings can
  expose 200 MB/500 MB tiers or per-agency limits.
- Uploads currently use existing banner asset storage. This is pragmatic for the
  first email media library pass, but long-lived public delivery rules for sent
  emails still need product/infra decisions.
- The picker is attached to imported HTML image replacement. Richer image
  controls such as crop, focal point, and dedicated gallery management are not
  done yet.
- Right-click is an accelerator only. The floating widget remains the primary
  visible action surface.
- Kimi browser verification was attempted after the latest toolbar/background
  fixes, but the WebBridge session was stuck on an older auth redirect tab and
  did not attach to the visible composer tab. Automated DOM/component coverage is
  the current verification for those two fixes.

## Recommended Next Steps

1. Run fresh verification for the media-library WIP:
   - `pnpm vitest run test/utils/edmImageAssets.test.ts test/utils/edmHtmlEditables.test.ts test/components/emailEdmImageLibraryPicker.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts test/components/emailEdmBlockRenderer.test.ts test/components/emailEdmBlockSettingsPanel.test.ts test/utils/edmInlineText.test.ts test/utils/edmPresets.test.ts test/utils/useEdmBuilderPresets.test.ts test/components/emailEdmTemplateThumbnail.test.ts test/components/emailEdmSectionThumbnail.test.ts test/components/emailTemplatesPanel.test.ts test/app/edmBuilderStore.test.ts`
   - `git diff --check`
2. Browser-check the picker:
   - Open `/agency/email/compose?starter=postcards-glidex`.
   - Select an imported image.
   - Click the floating widget image-change action.
   - Confirm the Image Library slideover opens instead of a prompt.
   - Select an asset if one exists; otherwise confirm empty/upload state renders.
3. Commit only scoped files:
   - `app/utils/edmImageAssets.ts`
   - `app/utils/edmHtmlEditables.ts`
   - `server/api/agency/email/assets/index.get.ts`
   - `server/api/agency/email/assets/upload.post.ts`
   - `app/components/email/builder/EdmImageLibraryPicker.vue`
   - `app/components/email/builder/EdmBlockRenderer.vue`
   - `app/components/email/builder/EdmFlyhubBuilder.client.vue`
   - `test/utils/edmImageAssets.test.ts`
   - `test/components/emailEdmImageLibraryPicker.test.ts`
   - `test/components/emailEdmHtmlEditableRenderer.test.ts`
   - this handoff doc

## Product Direction

The builder should keep using one dynamic selection model:

- Canvas click/right-click discovers the imported region.
- Floating widget exposes fast actions.
- Sidebar shows detailed settings for the selected region type.
- Media library opens from the same widget/right-click action and writes back to
  the selected imported image region.

This keeps imported templates editable without requiring every template to be
decomposed into hard-coded custom fields.
