# EDM Imported HTML Editing — Handoff (2026-06-05)

Continuation handoff for the EDM/Postcards builder work in
`/Users/paulgiurin/Documents/Projects/dashboard`.

## Repo State

- Branch: `main`
- Current shipped commit before this browser-verification update:
  `3c7a9c70 docs(email): update EDM imported editing handoff`
- Prior template-import commits brought in GlideX, FuturaX, and Aviro; MetaHome and
  the loose `Downloads/index.html` were intentionally excluded after the single
  HTML import corrupted the mixed template set.
- The checkout still contains many unrelated social-publishing/app WIP files.
  Do not disturb them when continuing EDM/email work.

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
  - Adds selected item padding controls for imported sub-regions. For repeated
    table rows, padding is written to the row cells so duplicated or individual
    benefit rows can be spaced independently.
  - Adds category-aware saved modules. The existing `edm_custom_modules.category`
    field is now exposed in save/rename UI, supports free-form new categories,
    and groups saved modules inside the Custom Modules palette.
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
- Selected imported rows/items expose top/bottom/left/right item padding in the
  sidebar inspector.
- Saved modules can be stored under built-in or newly created categories and
  are grouped by category in the Custom Modules picker.

Latest current-`main` picker check:

- Nuxt dev server was restarted on `http://127.0.0.1:3000`.
- Opened `/agency/email/compose?starter=postcards-glidex` in the real browser.
- Switched from Preview to Editor mode and selected the imported GlideX HTML
  wrapper.
- Confirmed imported HTML annotations were active for text and image regions.
- Selected the first imported GlideX background-image table cell. The floating
  widget showed the imported-image actions: duplicate, change image, link, and
  delete.
- The sidebar switched to imported image controls.
- The change-image action opened the Image Library slideover with agency-wide
  assets and the 200 MB upload cap.
- A scoped click on an actual image-library asset card changed the selected
  imported background URL from the bundled GlideX image to the R2 public asset
  URL and closed the picker.

### Media Library Picker

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

### Test Send / Sendability Gate

Committed in `78dec522` and `e788e6b9`:

- The EDM builder has a test-send modal with an optional email recipient field.
  Leaving it blank sends to the current account email.
- Test sends use `EMAIL_TEST_SENDING_ENABLED=true` instead of being coupled to
  the campaign send gate.
- The test-send endpoint runs the production renderer before Resend receives the
  message and returns sendability warnings to the UI.
- Relative media URLs are converted to absolute app URLs before sendability
  checks and sending.
- Exact duplicate `<style>` tags are deduped before test send to reduce clipping
  risk for imported Postcards HTML.
- Sendability now warns on non-HTTPS media URLs, since localhost/dev URLs are not
  reliable for real recipients.

### Auto-Import Warning Cleanup

Committed in `e788e6b9`:

- Removed the `getAppUrl` re-export from `server/utils/email.ts`; call sites now
  import it from `server/utils/appUrl.ts`.
- Renamed domain-specific helper exports that collided with Nuxt auto-imports:
  `CampaignHealthResult`, `parseEmailMarketingCsv`,
  `normalizeSubscriberEmail`, `buildCrmDraftPrompt`,
  `renderSavedReplyTemplate`, `socialPctDelta`, and `isSocialReportDue`.
- Removed the duplicate `AccountRow` re-export from Meta OAuth helpers.

## Verification Already Run

For committed imported HTML editing:

- Focused pass: 3 files / 15 tests passed.
- Wider EDM pass: 11 files / 89 tests passed.
- Kimi browser checks confirmed imported text/image selection and sidebar mode.

For media-library/text-toolbar/background-image work before this handoff update:

- Red test pass failed before the picker/util existed and before image-library
  emission replaced prompt behavior.
- Focused green pass: 3 files / 9 tests passed.
- Wider EDM/media pass: 13 files / 94 tests passed.
- Latest regression pass after imported text/background-image fixes:
  - `pnpm vitest run test/utils/edmHtmlEditables.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts`
  - Result: 2 files / 12 tests passed.
- Latest wider pass:
  - `pnpm vitest run test/utils/edmImageAssets.test.ts test/utils/edmHtmlEditables.test.ts test/components/emailEdmImageLibraryPicker.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts test/components/emailEdmBlockRenderer.test.ts test/components/emailEdmBlockSettingsPanel.test.ts test/utils/edmInlineText.test.ts test/utils/edmPresets.test.ts test/utils/useEdmBuilderPresets.test.ts test/components/emailEdmTemplateThumbnail.test.ts test/components/emailEdmSectionThumbnail.test.ts test/components/emailTemplatesPanel.test.ts test/app/edmBuilderStore.test.ts`
  - Result after duplicate/delete-region actions and item padding controls:
    13 files / 104 tests passed.
- Saved-module category focused pass:
  - `pnpm vitest run test/utils/edmCustomModuleCategories.test.ts test/components/emailEdmAddModuleMenu.test.ts`
  - Result: 2 files / 9 tests passed.
- Latest wider pass after saved-module categories:
  - `pnpm vitest run test/utils/edmImageAssets.test.ts test/utils/edmHtmlEditables.test.ts test/utils/edmCustomModuleCategories.test.ts test/components/emailEdmImageLibraryPicker.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts test/components/emailEdmBlockRenderer.test.ts test/components/emailEdmBlockSettingsPanel.test.ts test/components/emailEdmAddModuleMenu.test.ts test/components/emailEdmCategoryFlyoutPanel.test.ts test/utils/edmInlineText.test.ts test/utils/edmPresets.test.ts test/utils/useEdmBuilderPresets.test.ts test/components/emailEdmTemplateThumbnail.test.ts test/components/emailEdmSectionThumbnail.test.ts test/components/emailTemplatesPanel.test.ts test/app/edmBuilderStore.test.ts`
  - Result: 16 files / 115 tests passed.
- `git diff --check` passed.

For test-send/sendability and duplicate auto-import cleanup:

- Focused utility/send gate pass:
  - `pnpm vitest run test/server/utils/campaignHealth.test.ts test/crm/healthScoring.test.ts test/crm/aiDraft.test.ts test/social/aiDraft.test.ts test/social/savedReplies.test.ts test/social/oauthStore.test.ts test/social/oauthMetaMap.test.ts test/social/reportingAggregate.test.ts test/social/reportSchedule.test.ts test/utils/emailMarketingCsv.test.ts test/utils/emailMarketingEmail.test.ts test/server/utils/email.test.ts test/utils/emailSendability.test.ts test/utils/emailSendableHtml.test.ts test/server/api/emailTemplateTestSend.test.ts`
  - Result: 15 files / 89 tests passed.
- Nuxt startup check on `127.0.0.1:3001` showed no duplicate auto-import
  warnings. Temporary server was stopped and the port was cleared.

Fresh combined EDM/media/send-test pass on current `main`:

- `pnpm vitest run test/utils/edmImageAssets.test.ts test/utils/edmHtmlEditables.test.ts test/utils/edmCustomModuleCategories.test.ts test/components/emailEdmImageLibraryPicker.test.ts test/components/emailEdmHtmlEditableRenderer.test.ts test/components/emailEdmBlockRenderer.test.ts test/components/emailEdmBlockSettingsPanel.test.ts test/components/emailEdmAddModuleMenu.test.ts test/components/emailEdmCategoryFlyoutPanel.test.ts test/utils/edmInlineText.test.ts test/utils/edmPresets.test.ts test/utils/useEdmBuilderPresets.test.ts test/components/emailEdmTemplateThumbnail.test.ts test/components/emailEdmSectionThumbnail.test.ts test/components/emailTemplatesPanel.test.ts test/app/edmBuilderStore.test.ts test/utils/emailSendability.test.ts test/utils/emailSendableHtml.test.ts test/server/api/emailTemplateTestSend.test.ts`
- Result: 19 files / 138 tests passed.
- Existing SSR test warnings remain for unresolved stubbed `UIcon` in thumbnail
  tests; they do not fail the suite.

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
- Current test-send preparation makes relative URLs absolute. It does not yet
  ingest third-party or local template assets into an email-owned bucket by
  default.
- The picker is attached to imported HTML image replacement. Richer image
  controls such as crop, focal point, and dedicated gallery management are not
  done yet.
- Right-click is an accelerator only. The floating widget remains the primary
  visible action surface.
- Latest Kimi browser verification now succeeds on current `main` for imported
  text/image selection, imported background-image selection, sidebar mode,
  image-library opening, and applying a selected agency asset.

## Recommended Next Steps

1. Decide the sendable-asset policy:
   - keep current same-origin absolute URL preparation for local/dev tests, or
   - ingest imported template/media-library assets into a dedicated public email
     asset bucket before send/test-send.
2. Consider suppressing or stubbing `UIcon` in the SSR thumbnail tests to reduce
   noisy warning output.

## Product Direction

The builder should keep using one dynamic selection model:

- Canvas click/right-click discovers the imported region.
- Floating widget exposes fast actions.
- Sidebar shows detailed settings for the selected region type.
- Media library opens from the same widget/right-click action and writes back to
  the selected imported image region.

This keeps imported templates editable without requiring every template to be
decomposed into hard-coded custom fields.
