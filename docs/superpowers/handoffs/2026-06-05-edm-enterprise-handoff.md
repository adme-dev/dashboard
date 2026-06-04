# EDM Enterprise Epic — Handoff (2026-06-05)

Continuation of the EDM Postcards builder enterprise epic. This session shipped
**T1.5 + Phase 2 + Phase 3a + Phase 3b** to production. This doc captures current
state and **what's left**.

- **PRD / roadmap:** `docs/superpowers/specs/2026-06-04-edm-enterprise-prd.md`
- **Prior handoff:** `docs/superpowers/handoffs/2026-06-04-edm-enterprise-handoff.md`
- **Builder route:** `/agency/email/compose` (renders `EmailBuilderEdmFlyhubBuilder`). Templates gallery on `/agency/email`.

---

## ✅ Shipped to PROD this session (all verified in a real browser via Kimi WebBridge)

`origin/main` = **`24cb25f3`** · latest prod deploy **`a76c1c44`**.agency-dashboard-6cm.pages.dev

| Phase | What | Merge |
|---|---|---|
| **T1.5** | Marketing sync for the Phase-1 templates gallery (`features/index.vue` card + `[slug].vue` detail). | `19c63140` |
| **Phase 2 — Custom Modules** | Save a selected block subtree as a reusable named module; "Custom Modules" palette category (insert re-IDs + splices); rename/delete. **Migration 163 `edm_custom_modules` applied to prod Neon DB.** | `fa4ce3fe` |
| **Phase 3a — Rich inspector** | Shared pure `app/utils/edmStyle.ts` feeds BOTH renderers (omit-when-absent ⇒ byte-identical when unused). New style props: lineHeight, letterSpacing, textTransform, opacity, border (width/style/color/radius), boxShadow preset, backgroundImage. Grouped collapsible inspector: Spacing / Typography / Border & effects / Background image, gated by block type. | `a3b92cbd` |
| **Phase 3b — Inline editing** | Click a Heading/Text/Button on the canvas and edit in place (contenteditable, commit on blur). Text innerHTML sanitised via DOM-based `app/utils/edmInlineText.ts`. | `24cb25f3` |

**Test count:** 137 EDM tests green (`test/utils/edm*`, `test/utils/emailRender*`, `test/components/emailEdm*`, `test/server/edmCustomModules.test.ts`).

**Browser verification (this session, Kimi WebBridge on localhost:3000):** Custom Modules category ✓, Save-module button ✓, all 4 inspector groups ✓, inline-edit round-trip ✓ (canvas edit → inspector Content updated).

---

## ▶️ What's LEFT

### 1. T3b.3 — Drag-reorder (small, deferred from Phase 3b)
Move-up/down buttons already reorder top-level blocks (`EditorBlockWrapper` → `store.moveBlock`). Add a drag handle for direct reorder.
- Add a drag affordance to `EditorBlockWrapper.vue`'s block-actions toolbar; native `draggable` on the wrapper or handle.
- On drop, compute the new index among root children → `store.moveBlock(blockId, 'root', newIndex)`.
- Top-level reorder only (don't over-scope into containers for v1). Visual drop indicator.
- Test the index math as a pure helper; the DnD itself is hard to unit-test without `@vue/test-utils` (NOT installed — see Gotchas).

### 2. Phase 3c — Responsive Mobile/Desktop (the big remaining piece)
**This is the ONLY phase that changes the persisted document format — backwards-compat is mandatory.** PRD §6.3. Task list:
- **T3c.1 — Model/types (additive, optional).** Blocks gain optional per-device overrides + visibility flags, e.g. `data.mobile?: Partial<style/props>`, `data.hideOnMobile?`, `data.hideOnDesktop?`. Extend `app/types/edm.ts` + server `FlyhubBlockStyle`/block types. Existing docs (no per-device props) must render exactly as today.
- **T3c.2 — Editor device toggle + per-device inspector writes.** Mobile/Desktop switch in the builder toolbar; the inspector writes to the active device's override layer (desktop = base, mobile = `data.mobile`). Decide merge semantics (mobile inherits desktop unless overridden).
- **T3c.3 — Editor renderer device-aware.** `EdmBlockRenderer` + canvas reflect the active device (apply merged style; honor hide flags by greying/hiding).
- **T3c.4 — Server renderer responsive output.** Emit responsive CSS — `@media (max-width:600px)` overrides + `hideOnMobile/Desktop` via the standard email mobile-class pattern. The server renderer is per-block `renderHtml` (no shared style builder) — thread device overrides through `extendedStyleCss` or a new media-block emitter. **Thumbnails always render desktop.**
- **T3c.5 — hide-on-device.** Mobile/desktop visibility (email-safe display:none + class toggles).
- **T3c.6 — Tests (incl. backwards-compat) + review.** A doc with NO per-device props must produce byte-identical output (mirror the Phase-3a backwards-compat tests). Add migration only if a column is needed (likely NOT — it's all inside the existing `body_source` JSONB).

### 3. Review follow-ups (non-blocking, from this session's subagent reviews)
- **3a-M3 — MJML vs HTML border/radius divergence.** `container.ts`/`avatar.ts`/`button.ts` MJML branches still use the old border/radius logic while `renderHtml` uses `extendedStyleCss`. **The sent path is HTML (`renderTemplateDocument` → renderHtml), so this is preview-fidelity only.** Route MJML through the shared helper too, or document the HTML-only scope.
- **3b-H1 — sanitizer tested only under happy-dom.** `sanitizeInlineHtml` runs in the real browser but tests use happy-dom (non-spec parser). The wholesale-drop deny-list (svg/math/script/style/template/…) is robust regardless, but add a **real-browser (Playwright) sanitizer test** before heavy reliance.
- **3a-M4 — naming footgun.** `props.lineHeight` (Divider line *thickness*, px) vs `style.lineHeight` (CSS line-height). No bug today; rename one before it bites.
- **3b — rich-text inline formatting.** Inline editing is plain-text for Heading/Button and sanitised-HTML for Text, but there's **no formatting toolbar** (bold/italic/link) on the canvas. Optional enhancement: a floating mini-toolbar that wraps the selection in the whitelisted tags `sanitizeInlineHtml` already allows.

### 4. Lower priority / optional
- **Phase 1b** — template folders + drafts grouping (needs persistence). Deferred.
- **Phase 1 nits** — "Your templates" is a list (spec wanted a preview grid); `EdmTemplateThumbnail` uses index `:key`.
- **anchor-id control** — deferred in 3a because renderers don't emit a block `id` attribute. If wanted: emit `id` on the block's outer element in each `renderHtml` + add an "Advanced › Anchor ID" inspector control.

---

## How to work on this (IMPORTANT)

- **Build in the worktree** `.worktrees/edm-postcards-builder` (branch `feature/edm-postcards-builder`, real `node_modules`). It's fast-forwarded to `origin/main`. Before vitest in a fresh worktree run `nuxt prepare`.
- **The MAIN checkout** (`/Users/paulgiurin/Documents/Projects/dashboard`) carries ~40 uncommitted **social-publishing WIP files — DO NOT disturb them.** None overlap EDM files. Local `main` is currently synced to `origin/main` (`24cb25f3`).
- **Merge:** EDM commits are linear/ff-able onto `origin/main` — `git push origin HEAD:main` from the worktree. (Direct push works; review already done per-phase via subagent.)
- **Deploy from the clean** `.worktrees/deploy-prod` worktree: `git checkout <commit>` → (deps unchanged ⇒ no install needed) → `pnpm deploy:production` (uses `--branch main` = production). Cold Nitro build ≈ 8 min. Verify the prod alias + `/agency/email`.
- **Dev server:** a fresh one was started this session (background, PID may be stale by next session) on `:3000` from the main checkout. **After any branch/file sync, RESTART the dev server** — HMR does not register new auto-imported files (composables/API routes/components) from a bulk git update. (`:3000` EADDRINUSE ⇒ kill the old PID first.) `pnpm dev` inside a `.worktrees/*` worktree needs `CHOKIDAR_USEPOLLING=true`.

## Key architecture / gotchas
- **Two renderers, kept in lockstep by `app/utils/edmStyle.ts`** — `extendedStyleVue` (editor `:style`) + `extendedStyleCss` (server inline CSS). Server imports `~~/app/utils/edmStyle` (Nitro resolves `~~/app/*`; precedent `officeLobbyAvailability`). **Invariant: when a prop is absent, emit nothing → byte-identical render.** Keep this when adding 3c device overrides.
- **Inline-CSS injection is sanitised at the render boundary** (`edmStyle.ts`: `safeCssColor`/`safeLineHeight`/allow-lists/`safeCssUrl`). The 3a review found a CRITICAL here (raw `borderColor` into `style=""`) — already fixed. Any new string style prop MUST be validated the same way.
- **Text renders RAW via v-html (editor) + unescaped (server).** Inline-edited Text is sanitised by `sanitizeInlineHtml` (whitelist b/strong/i/em/u/a/br/span; drop foreign-content/raw-text subtrees wholesale; href http(s)/mailto only). Heading/Button are plain-text + escaped on render.
- **Editor `EdmBlockRenderer` < server renderer block types** — a preset can pass the server no-fallback test yet show "Unknown block" in the editor/thumbnail. New presets need the INTERSECTION of both renderers.
- **`@vue/test-utils` is NOT installed.** Component tests use `createSSRApp` + `renderToString` (SSR) with manual stubs + globals (`ref`/`computed`/`reactive`/auto-imported composables). No interactive (click/blur) component tests — cover logic in pure utils + assert rendered attributes via SSR.
- **Custom modules are agency-wide** (no `client_id` write path; column kept for future), mirroring `edm_templates`.

## State
- Worktree clean at `24cb25f3`. `origin/main` == local `main` == `24cb25f3`.
- Memory: `~/.claude/projects/.../memory/edm-postcards-builder.md` (+ MEMORY.md index) — update after 3b.3 / 3c.
