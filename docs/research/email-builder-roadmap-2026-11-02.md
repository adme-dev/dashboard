# Email Builder Roadmap

_Created 2 Nov 2026 — based on a teardown of RGE Studio (white-labelled Beefree SDK v3.56.1) compared against XeroFlow's EDM builder._

Beefree is used as **design reference only** — no code copied.

## Key findings from the Beefree teardown

- **Server-side render:** editor posts JSON to `bee-multiparser…/api/v3/parser/email` (with options for beautified HTML and Outlook button style). Same shape as our `renderFlyhubDocumentToHtml`.
- **Data model:** `page → rows → columns (12-grid) → modules`; every node has `uuid` + `locked`; rows also `synced`. Each module has `style` + `mobileStyle` + `hoverStyle` + `hideContentOnMobile/Desktop/Amp`.
- **Display conditions:** `row.container.displayCondition = {type, label, description, before, after}` — the parser wraps the row in `before`/`after` strings (any templating syntax). Not evaluated in the editor.
- **Merge tags:** stored inline as `<code data-bee-type="mergetag">` chips; brand-level list of `{name, value, previewValue}`; plus "special links" (unsubscribe, web version).
- **Smart Check categories:** missing alt text, image link, copy link, headings, main language, email details (subject/preheader); too many headings; low colour contrast; font size too small; images too heavy; HTML too large.
- **Dark mode:** preview-only simulation; exported HTML has no dark-mode CSS → opportunity to beat them.
- **Embedding config:** `advancedPermissions` (per-role lock/hide of controls), `contentDefaults` (brand styles for new blocks), `rowsConfiguration`, `onSave` / `onAutoSave` / `onComment` hooks.
- Other services: live co-editing (Lightstreamer), "bump row" (resizes a pasted row to the email's width), AI text/metadata/image generation.

Raw captures (temporary): `/private/tmp/claude-501/-Users-paulgiurin/1a2e9dae-0099-4210-96dd-0fa2da8019b7/scratchpad/{rge,bee-sdk}/`

---

## Phase 1 — Merge tags

- [ ] **Merge-tag table per client:** `name`, `token`, `preview_value`, `fallback`, `client_id`. Seed with `email`, `name`, `first_name`, `unsubscribe_url`.
- [ ] **One shared merge-tag function** used by both preview and send — replace `server/utils/email-marketing/render/flyhub-html-renderer.ts:216-221` and `campaignSend.ts:284-298`. Allow spaces inside braces, support fallbacks (`{{first_name|there}}`), escape the filled-in values.
- [ ] **Protect tags in the text editor:** allow `<code data-merge="…">` in `app/utils/edmInlineText.ts`; render tags as chips that can't be partly edited; turn them back into tokens at render.
- [ ] **Merge-tag picker** in the text toolbar and the subject/preheader fields.
- [ ] **"Preview as…"** — pass sample values into `renderPreview` (`EdmFlyhubBuilder.client.vue:360-366`).
- [ ] **Escape subject/preheader** in `<title>` and the hidden preheader div; add spacer padding after the preheader so body text doesn't leak into the inbox preview.

## Phase 2 — Conditional content

- [ ] Add optional `displayCondition` `{label, description, before, after}` to blocks and rows.
- [ ] Renderer wraps the block's HTML in `before`/`after` (no evaluation).
- [ ] Per-client list of named conditions + picker in `BlockSettingsPanel.vue`; badge on the block in the canvas.
- [ ] ⚠️ **Decision needed:** Resend doesn't evaluate template logic — either XeroFlow evaluates conditions at send time, or limit them to simple field checks.

## Phase 3 — Brand kit and locking

- [ ] Connect `banner_brand_kits` (or a new table for email brands) to the builder: main colour, fonts, link colour, default email width. Remove the hard-coded `#2f4574`.
- [ ] Pre-style new blocks from the client's brand kit (like Beefree's `contentDefaults`).
- [ ] `locked` flag on blocks — can't be moved, deleted or restyled; text stays editable.
- [ ] Per-role permissions: agency users edit everything; dealer users only get the settings the agency allows.
- [ ] Synced modules: custom modules linked rather than copied; editing updates every template that uses it; "detach" option.

## Phase 4 — Pre-send checks

- [ ] Checks that read the template JSON: missing alt text, buttons/images with no link, low text/background contrast (WCAG), font size under 14px, missing subject/preheader, no heading.
- [ ] Show them in `CampaignPreflightPanel.vue` and in the builder, with links that jump to the problem block.
- [ ] (Optional) AI alt-text suggestions for images without any.

## Phase 5 — Rendering quality

- [ ] Dark mode: `color-scheme` meta tag, `prefers-color-scheme` CSS, `[data-ogsc]` overrides for Outlook, dark logo variant per image.
- [ ] Bulletproof Outlook buttons using drawn-shape (VML) markup inside Outlook-only blocks.
- [ ] Adjustable email width (600–700px); "reverse stacking on mobile" option for columns.
- [ ] Move styles from `<style>` blocks inside Html blocks onto the elements themselves (e.g. `juice`) — check first that it runs on Cloudflare Workers.

## Phase 6 — Workflow

- [ ] Template version history: snapshot on every save, restore button.
- [ ] Comments on blocks (a thread per block ID).
- [ ] Approval status: draft → in review → approved; campaigns can't be scheduled unless the template is approved.
- [ ] Hosted web version + "view in browser" link; UTM parameters per campaign added to every link.

## Clean-up

- [ ] Remove the unused `@flyhub/*` packages, the MJML/Maizzle stubs (`blocks/maizzle-helpers.ts`, `block-registry.ts`) and the empty automotive helpers.
- [ ] Decide whether to merge the automation `email_templates` table into `edm_templates`.

---

**Suggested order:** Phase 1 → 2 → 4 give the quickest visible wins; Phase 3 is the selling point for dealer clients; 5 and 6 come after.
