# EDM Enterprise Epic — Handoff (2026-06-05)

Continuation of the EDM Postcards builder enterprise epic. This session shipped
**T1.5 + Phase 2 + Phase 3a + Phase 3b** to production. This doc captures current
state and **what's left**.

- **PRD / roadmap:** `docs/superpowers/specs/2026-06-04-edm-enterprise-prd.md`
- **Prior handoff:** `docs/superpowers/handoffs/2026-06-04-edm-enterprise-handoff.md`
- **Builder route:** `/agency/email/compose` (renders `EmailBuilderEdmFlyhubBuilder`). Templates gallery on `/agency/email`.

## Continuation update (Codex, 2026-06-05)

Additional work has been committed on `feature/edm-postcards-builder` after the
handoff baseline `09fe609f`. These commits are branch-local unless/until merged
and deployed:

| Commit | What |
|---|---|
| `98c719ed` | T3b.3 drag-reorder for top-level EDM blocks. |
| `3cdf0904` → `d060cf8c` | Phase 3c responsive model/editor/server rendering, with backwards-compat coverage. |
| `952c5591` | Divider naming follow-up: new `props.lineThickness`, legacy `props.lineHeight` fallback. |
| `2a65682a` | MJML preview parity follow-up for rich border/radius styles in Container, Avatar, and Button. |
| `cccff5b6` | Real-browser Chrome sanitizer coverage for `sanitizeInlineHtml` via dependency-free CDP harness. |
| `91bec914` | Phase 1 nit: `EdmTemplateThumbnail` now keys rendered starter blocks by document block id, not array index. |

Focused EDM verification after the continuation: 170 tests green across
`test/utils/edm*`, `test/utils/emailRender*`, `test/components/emailEdm*`,
`test/components/emailEditorBlockWrapper.test.ts`, `test/app/edmBuilderStore.test.ts`,
and `test/server/edmCustomModules.test.ts`. Targeted ESLint for touched files
passed; `EdmBlockRenderer.vue` still has the known `vue/no-v-html` warnings.

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

### 1. Review follow-ups still open
- **3b — rich-text inline formatting.** Inline editing is plain-text for Heading/Button and sanitised-HTML for Text, but there's **no formatting toolbar** (bold/italic/link) on the canvas. Optional enhancement: a floating mini-toolbar that wraps the selection in the whitelisted tags `sanitizeInlineHtml` already allows.

### 2. Lower priority / optional
- **Phase 1b** — template folders + drafts grouping (needs persistence). Deferred.
- **Phase 1 nit** — "Your templates" is a list (spec wanted a preview grid).
- **anchor-id control** — deferred in 3a because renderers don't emit a block `id` attribute. If wanted: emit `id` on the block's outer element in each `renderHtml` + add an "Advanced › Anchor ID" inspector control.

---

## How to work on this (IMPORTANT)

- **Build in the worktree** `.worktrees/edm-postcards-builder` (branch `feature/edm-postcards-builder`, real `node_modules`). It's fast-forwarded to `origin/main`. Before vitest in a fresh worktree run `nuxt prepare`.
- **The MAIN checkout** (`/Users/paulgiurin/Documents/Projects/dashboard`) carries ~40 uncommitted **social-publishing WIP files — DO NOT disturb them.** None overlap EDM files. Local `main` is currently synced to `origin/main` (`24cb25f3`).
- **Merge:** EDM commits are linear/ff-able onto `origin/main` — `git push origin HEAD:main` from the worktree. (Direct push works; review already done per-phase via subagent.)
- **Deploy from the clean** `.worktrees/deploy-prod` worktree: `git checkout <commit>` → (deps unchanged ⇒ no install needed) → `pnpm deploy:production` (uses `--branch main` = production). Cold Nitro build ≈ 8 min. Verify the prod alias + `/agency/email`.
- **Dev server:** a fresh one was started this session (background, PID may be stale by next session) on `:3000` from the main checkout. **After any branch/file sync, RESTART the dev server** — HMR does not register new auto-imported files (composables/API routes/components) from a bulk git update. (`:3000` EADDRINUSE ⇒ kill the old PID first.) `pnpm dev` inside a `.worktrees/*` worktree needs `CHOKIDAR_USEPOLLING=true`. To pick a port from a worktree, prefer `pnpm exec nuxt dev --port <port>`; `pnpm dev -- --port <port>` was observed to start a Nuxt welcome shell because the extra `--` is passed through to `nuxt dev`.

## Key architecture / gotchas
- **Two renderers, kept in lockstep by `app/utils/edmStyle.ts`** — `extendedStyleVue` (editor `:style`) + `extendedStyleCss` (server inline CSS). Server imports `~~/app/utils/edmStyle` (Nitro resolves `~~/app/*`; precedent `officeLobbyAvailability`). **Invariant: when a prop is absent, emit nothing → byte-identical render.** Keep this when adding 3c device overrides.
- **Inline-CSS injection is sanitised at the render boundary** (`edmStyle.ts`: `safeCssColor`/`safeLineHeight`/allow-lists/`safeCssUrl`). The 3a review found a CRITICAL here (raw `borderColor` into `style=""`) — already fixed. Any new string style prop MUST be validated the same way.
- **Text renders RAW via v-html (editor) + unescaped (server).** Inline-edited Text is sanitised by `sanitizeInlineHtml` (whitelist b/strong/i/em/u/a/br/span; drop foreign-content/raw-text subtrees wholesale; href http(s)/mailto only). Heading/Button are plain-text + escaped on render.
- **Editor `EdmBlockRenderer` < server renderer block types** — a preset can pass the server no-fallback test yet show "Unknown block" in the editor/thumbnail. New presets need the INTERSECTION of both renderers.
- **`@vue/test-utils` is NOT installed.** Component tests use `createSSRApp` + `renderToString` (SSR) with manual stubs + globals (`ref`/`computed`/`reactive`/auto-imported composables). No interactive (click/blur) component tests — cover logic in pure utils + assert rendered attributes via SSR.
- **Custom modules are agency-wide** (no `client_id` write path; column kept for future), mirroring `edm_templates`.

## State
- Original handoff baseline: `origin/main`/local `main` at `09fe609f`.
- Continuation branch: `feature/edm-postcards-builder` at `91bec914`.
- Memory: `~/.claude/projects/.../memory/edm-postcards-builder.md` (+ MEMORY.md index) — update after 3b.3 / 3c.
