# PRD — Enterprise EDM Builder

**Status:** Active
**Owner:** Paul (XeroFlow Agency)
**Author:** Claude (Opus 4.8)
**Date:** 2026-06-04
**Surface:** `/agency/email` (composer + templates), client-portal report surfaces unaffected

---

## 1. Vision

Take the EDM builder from "Postcards-pattern" to **Postcards-class / enterprise**: a real template library, reusable saved modules, and a rich, responsive, WYSIWYG editor — so agency staff can design polished, on-brand marketing emails end-to-end without writing HTML.

Reference: Designmodo Postcards (used only for *pattern/ergonomics*; we never copy their templates, branding, or proprietary assets — all content/imagery is our own or royalty-free).

## 2. Current State (already shipped this milestone)

- Flat `EdmFlyhubDocument` model (blocks keyed by id + `root.data.childrenIds` order). Persisted via existing template/campaign APIs. No new persistence format introduced by prior work.
- Rich, image-driven **section preset library** (`app/utils/edmPresets.ts` + `edmSectionBuilders.ts`) — 6–9 variants per category, Lorem Picsum photography, grayscale wordmark logos, services grids.
- **Palette**: slim category rail + hover/click flyouts of live-rendered section thumbnails (`EdmSectionThumbnail.vue`); unified **"Add module" bubble** (Basic icon grid + section categories) on empty-state and end-of-canvas.
- **Inspector** (`BlockSettingsPanel.vue`): metadata-driven controls per block type (basic — padding + a handful of per-type fields).
- **Starter templates** (3) + **visual template gallery** (`TemplatesPanel.vue`): blank + starter cards.
- Server email renderer (`server/utils/email-marketing/render/*`) + editor renderer (`EdmBlockRenderer.vue`). Renderer intersection constraint: rich layouts use `Html` blocks.

## 3. Sub-Projects & Phasing

Three sub-projects; **1 and 2 are independent and individually shippable; 3 is a multi-phase epic and the deepest architectural change.**

Recommended order: **1 → 2 → 3a → 3b → 3c.**

| # | Sub-project | Size | Backend? | Persisted-format change? |
|---|---|---|---|---|
| 1 | Templates experience | M | minor | no |
| 2 | Custom Modules (save sections) | M–L | yes (DB+API) | no (reuses block JSON) |
| 3a | Rich per-element inspector | M | no | no |
| 3b | Inline WYSIWYG editing | L | no | no |
| 3c | Responsive Mobile/Desktop | L | no | **yes** (per-device props) |

---

## 4. Phase 1 — Templates Experience

### 4.1 Goal
A browsable, filterable template library that opens full, polished starter emails — the front door to the builder.

### 4.2 Requirements
- **Bigger starter library:** 10–14 full multi-section starter templates (built from the rich section library + `edmSectionBuilders`), each a complete email (header → content/feature/cta → footer). Spread across **usages** (Newsletter, Promotion, Transactional, Announcement, Event, Welcome) and **styles** (Editorial, Retail, Bold/Dark, Minimal, Corporate). Each: `id, name, description, usage, style, industry?, previewTone, sectionPresetIds[], subject, previewText, isNew?`.
- **Gallery UX** (`TemplatesPanel.vue`): a "Create blank" card + a grid of starter cards with **live-rendered previews** (reuse `EdmSectionThumbnail` or a full-doc mini-render), `NEW` badges, name + description + usage/style tag chips.
- **Filter chips:** filter the gallery by **Usage** and **Style** (and optionally Industry) — multi-select chip row; "All" default. Pure client-side filter over the starter metadata. Search box (by name/description).
- **Drafts / Saved templates:** keep the existing saved-template list (open/duplicate/rename/delete) but present it as a "Your templates" section under the starter gallery, grid style, with live previews.
- **No new persistence** in Phase 1 (folders deferred to Phase 1b). Starters load via the existing `?starter=<id>` path.

### 4.3 Non-goals (Phase 1)
- Folders, drag-to-folder, team sharing (→ Phase 1b, needs persistence).
- Editing templates as templates (they expand into a normal document on open).

### 4.4 Success criteria
- ≥10 starter templates render with no fallback (server) and no "Unknown block" (thumbnail), all built from intersection-safe blocks.
- Gallery filters by usage/style and searches by text; "Create blank" + each starter opens the composer correctly (`?starter=`); saved-template actions intact.
- 0 new typecheck errors beyond the tolerated baseline; tests green.

### 4.5 Task list (Phase 1)
- **T1.1** Starter-template builder helpers: a `buildStarterDoc(template)` that assembles a full `EdmFlyhubDocument` from `sectionPresetIds` (extend existing `buildStarterTemplateDocument`), + a typed `EdmStarterTemplate` with `usage`/`style`/`industry`/`isNew`. Tests: every starter builds + renders server-side with no fallback.
- **T1.2** Expand `EDM_STARTER_TEMPLATES` to 10–14 full templates across usages/styles using the rich section library. Tests: count + per-template render + unique ids + referenced section ids resolve.
- **T1.3** Full-document mini-preview: a `EdmTemplateThumbnail` (or reuse `EdmSectionThumbnail` over the assembled doc's blocks) that live-renders a scaled full-email preview for a starter. SSR test.
- **T1.4** Rework `TemplatesPanel.vue`: filter-chip row (Usage/Style) + search + "Create blank" + starter grid (live previews, NEW badges, tag chips) + "Your templates" saved grid (preserve open/duplicate/rename/delete + modals). Keep `?starter=` open path.
- **T1.5** Marketing-page sync (features/index + [slug] email-builder entry) to mention the template library. Verify + final review.

---

## 5. Phase 2 — Custom Modules (Save Sections)

### 5.1 Goal
Let users save a section they've built as a reusable named module that appears in a **Custom Modules** palette category, reusable across emails (org-scoped).

### 5.2 Requirements
- **Save action:** on a selected block/section (or the whole current selection), "Save as module" → name it → persists the block JSON (the section's blocks) as a custom module for the org.
- **Persistence:** new table `edm_custom_modules` (`id, org/agency scope, created_by, name, description?, category, blocks JSONB, preview_tone, created_at, updated_at`). API: list / create / rename / delete (RBAC: `requireAuth` + write access; org-scoped).
- **Palette integration:** a **Custom Modules** category in the flyout + add-module bubble, listing saved modules with live thumbnails; insert works like any section preset (expands the stored blocks into the document).
- **Management:** rename/delete a saved module (from the palette or a small manager).

### 5.3 Non-goals
- Cross-org sharing, versioning, marketplace.

### 5.4 Success criteria
- Save a section → it appears in Custom Modules → insert reproduces it faithfully → rename/delete work; org-scoped + RBAC-guarded; migration runs on prod DB.

### 5.5 Task list (Phase 2)
- **T2.1** Migration `edm_custom_modules` + run on DB.
- **T2.2** Server API (`server/api/agency/email/modules/*`): list/create/rename/delete, org-scoped, RBAC, Zod-validated, store sanitized block JSON.
- **T2.3** Composable + "Save as module" UI (from block selection / inspector), name dialog.
- **T2.4** Palette "Custom Modules" category fed by the API, live thumbnails, insert → expand stored blocks. Empty state.
- **T2.5** Tests (pure normalizers + API contract) + final review + deploy.

---

## 6. Phase 3 — Enterprise Editing UX

### 6.1 Phase 3a — Rich per-element inspector
- Expand `BlockSettingsPanel.vue` (+ `edmSectionSettings.ts`) into a full inspector: **box model** (padding per side; margin where supported), **typography** (font family, size, weight, line-height, letter-spacing, color, transform, align), **link** toggle + URL, **opacity**, **border** (width/style/color/radius), **shadow**, **background** (color/image), **alignment**, **anchor/id**. Grouped, collapsible sections; only show controls relevant to the selected block type (driven by extended metadata). Writes through existing `updateProp`/`updateStyle`. Must round-trip to BOTH renderers.
- Risk: editor and server renderers must honor the new style props consistently (some are currently hardcoded — e.g. footer text color). Audit + align as part of 3a.
- Task list: T3a.1 audit renderer style support; T3a.2 extend field metadata + style schema; T3a.3 inspector UI (grouped controls); T3a.4 renderer alignment for newly-editable props; T3a.5 tests + review.

### 6.2 Phase 3b — Inline WYSIWYG editing
- Click a text/element on the canvas → edit in place (contenteditable for text; element toolbar with drag/duplicate/delete/link/move) — the Postcards "TEXT" selection chrome. Selection syncs with the inspector. Keyboard + a11y.
- Task list: T3b.1 canvas selection model + element overlay/toolbar; T3b.2 inline text editing (contenteditable → block props) with sanitization; T3b.3 drag-reorder within canvas; T3b.4 tests + review.

### 6.3 Phase 3c — Responsive Mobile/Desktop
- **Persisted-format change:** blocks gain optional per-device overrides (e.g. `data.mobile` partial style/props) + `hideOnMobile`/`hideOnDesktop`. Editor gets a Mobile/Desktop toggle; canvas + inspector reflect the active device; server renderer emits responsive CSS (media queries) / mobile overrides; thumbnails render desktop.
- **Backwards-compat:** existing docs (no per-device props) render unchanged.
- Task list: T3c.1 model + types (additive, optional); T3c.2 editor device toggle + per-device inspector writes; T3c.3 editor renderer device-aware; T3c.4 server renderer responsive output; T3c.5 hide-on-device; T3c.6 tests (incl. backwards-compat) + review.

---

## 7. Cross-Cutting

- **Renderer intersection rule** stays: any block type must render in BOTH `EdmBlockRenderer.vue` and the server `render/blocks/*`. Rich layouts via `Html` blocks until/unless promoted to first-class editable blocks (a possible later track).
- **Imagery:** Lorem Picsum for photography placeholders (swap-before-send notice), grayscale wordmarks for logos, CSS for icons. No third-party trademarks/assets.
- **No regressions:** keep existing campaign/template save/load, send-gating (`EMAIL_SENDING_ENABLED` stays off; never trigger a live send), client-portal report surfaces.
- **Workflow:** each phase built via `superpowers:subagent-driven-development` (per-task spec + quality review gates), then merge → push → deploy from the clean `.worktrees/deploy-prod` worktree, then browser-verify via the user's session.
- **Testing:** Vitest unit + SSR component tests; render-no-fallback loops; typecheck (tolerated `:style` baseline only).

## 8. Risks
- **3c format change** is the riskiest (touches persisted docs + both renderers) — additive/optional props + backwards-compat tests mitigate.
- **Picsum** offline/CSP fragility — surfaced via the existing "swap before sending" notice.
- **Inline editing (3b)** is interaction-heavy and hardest to unit-test — lean on focused component tests + browser verification.
- **Scope creep** — strictly phase-gated; ship 1 and 2 before starting 3.

## 9. Rollout
Phase-by-phase: build → review → merge/push → deploy → browser-verify. Phases 1 & 2 are independently valuable and ship first.
