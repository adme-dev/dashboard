# Email Marketing Module — Session Handoff (2026-05-31)

**Branch:** `feat/email-marketing` (pushed; PR #20 open against `main`)
**Latest commit:** `7b03bc8` (Phase 2a-ii-1 complete)
**Resume target:** Phase 2a-ii-2 (editor canvas)

---

## TL;DR — what to do next

Execute **Phase 2a-ii-2 (canvas)**: port `EdmBlockRenderer`, `EditorBlockWrapper`, `ContainerBlockRenderer`, `ColumnsContainerRenderer` from the sibling project, re-skinned shadcn→Nuxt UI, and wire add/move/delete/insert into the empty editor shell. There is no plan file for 2a-ii-2 yet — write one first (use `superpowers:writing-plans`), following the pattern of the 2a-ii-1 plan.

Everything below 2a-ii-1 is **done, tested, pushed**. The build is green (0 errors, 0 warnings, 31 email tests pass across the module).

---

## Done so far (all on `feat/email-marketing`, pushed)

| Phase | What | Verified |
|---|---|---|
| **1** | Lists / subscribers / membership / CSV import (`/agency/email`) | 13 tests, live-DB, UI smoke |
| **2a-i** | Pure-TS flyhub render pipeline (`server/utils/email-marketing/render/`) + `edm_templates` + CRUD/render API | 8 renderer tests, live-DB render |
| **2a-ii-1** | Editor foundation: `@flyhub` install + Workers stub-alias build, types, store→composable, EmailLayoutSettings re-skin, empty shell at `/agency/email/compose` | 5 store tests, browser smoke (renderer reachable, settings panel live) |

**Migrations applied:** 132 (`email_subscribers`/`email_lists`/`subscriber_lists`), 133 (`edm_templates`). Next slot: **134**.

**Test count:** 31 email tests (13 + 8 + 5 + the 5 import-parse… run `pnpm exec vitest run test/utils/emailMarketing*.test.ts test/utils/emailRender*.test.ts test/app/edmBuilderStore.test.ts`).

---

## Source of truth for the build (cherry-pick origin)

`/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/edm` — a production Nuxt 4 + Cloudflare + Resend EDM module. We cherry-pick from it. `@flyhub/email-builder` is the Vue 3 port of EmailBuilder.js.

**Editor components to port for 2a-ii-2** (all in `layers/edm/components/edm/flyhub/`):
- `EdmBlockRenderer.vue` (181 lines, no UI deps — stateless block→HTML)
- `EditorBlockWrapper.vue` (349 lines — selection + move/delete/duplicate + insert popovers; uses `Button`, `Popover`)
- `ContainerBlockRenderer.vue` (340 lines — nested children + add-child popover)
- `ColumnsContainerRenderer.vue` (423 lines — 2/3-col layout + per-column add)

shadcn→Nuxt UI map: `Button`→`UButton`, `Popover`/`PopoverTrigger`/`PopoverContent`→`UPopover` (check slot API), `Input`→`UInput`, `Select`→`USelect`, `Slider`→`USlider`. **No DnD library** (move = up/down + insert-at). **No rich text.** Color = native `<input type=color>`.

The store (`useEdmBuilder`) already exposes everything the canvas needs: `addBlock(type,parentId,position?,initialData?)→id`, `removeBlock`, `moveBlock`, `duplicateBlock`, `setSelectedBlockId`, `selectedBlockId`, `document`, `getBlock`, `updateBlock*`, `getLayoutSettings`, `undo/redo/canUndo/canRedo`.

---

## Remaining roadmap

- **2a-ii-2** — Canvas (block renderers + wrapper + container/columns + add/move/delete). ← NEXT
- **2a-ii-3** — `BlockSettingsPanel.vue` (1,154 lines) inspector, Slider/Select/Popover re-skin.
- **2a-ii-4** — Live preview (wire to `POST /api/email/templates/render` — already built in 2a-i), HTML view, save to `edm_templates`, undo/redo toolbar, link from `/agency/email`.
- **2b** — campaigns table + `campaign_recipients` + chunked queue sender (≤2 req/s Resend pacing) + cron scheduler/watchdog + send gate.
- **Phase 3** — Resend webhooks + tracking + suppression. **Phase 4** — public subscribe/unsubscribe (RFC 8058). **Phase 5** — templates mgr + segmentation + marketing-page sync.

Full design: `docs/superpowers/specs/2026-05-31-email-marketing-module-design.md`. Plans: `docs/superpowers/plans/2026-05-31-email-marketing-*.md`.

---

## Critical gotchas (learned this session — don't repeat)

1. **Port: grep dynamic `import()` too**, not just static `from`. `html-block.ts` had `import('~~/server/utils/email-components')` + offers generator that broke the **Nitro build** (Vitest doesn't resolve dynamic imports, so unit tests passed but `pnpm dev` failed). Stubbed both. Any new ported block: check `grep -nE "import\(" file` and `grep -nE "from '\./" file` for uncopied siblings.
2. **App import paths must be `~~/app/...` for vitest.** Nuxt runtime resolves `~/types/edm`, but vitest maps `~`→root. Use `~~/app/types/edm` / `~~/app/composables/...` in anything that's unit-tested (existing app tests do this). `.vue` files only rendered in Nuxt can use `~/...`.
3. **`@flyhub` is client-only.** It's aliased to `lib/flyhub-stub.ts` in `nitro.alias` (nuxt.config.ts) so it never enters the Workers server bundle. The server renders via the pure-TS pipeline (no `@flyhub`). Verify after any nuxt.config change: dev build → render endpoint returns 401, `grep -c "Duplicated imports"` = 0, no `Could not load`.
4. **`/agency/**` is `ssr: false`** (client-only SPA) — composer route needs no special SSR handling; `@flyhub` imports are fine client-side.
5. **Store is a singleton composable, NOT Pinia** (dashboard has no Pinia). `useEdmBuilder()` returns one cached `createStore()` instance. State refs live inside `createStore` (cached), not per-call.
6. **Table name:** `edm_templates` (NOT `email_templates` — that's taken by the automation/notification feature).
7. **ESLint is strict:** no `any` (use `unknown`), no trailing commas, comma member-delimiters, max-1-statement-per-line. Run `pnpm exec eslint --fix <dir>` then fix residual `any`/unused manually. Ported blocks with dead automotive code carry a file-level `/* eslint-disable @typescript-eslint/no-unused-vars, no-explicit-any */`.
8. **Migrations:** run automatically — `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-); psql "$DATABASE_URL" -f <file>`.
9. **Push needs the `adme-dev` gh account** (active). **Concurrent session active** (tracking-tag work, PR #21) — may touch `nuxt.config.ts`/`package.json`; expect possible merge conflicts there, resolvable at merge.
10. **Two untracked CRM docs** in the tree (`...native-crm-twenty-blueprint-design.md`, `...crm-slice-1-people-companies.md`) are from the concurrent session — **not ours, leave them.**

---

## How to resume (fresh session)

1. `cd /Users/paulgiurin/Documents/Projects/dashboard && git checkout feat/email-marketing && git pull`
2. Read memory `email-marketing-flyhub-phase2.md` + this handoff + the spec.
3. Sanity: `pnpm exec vitest run test/utils/emailMarketing*.test.ts test/utils/emailRender*.test.ts test/app/edmBuilderStore.test.ts` (should pass).
4. Write the **2a-ii-2 plan** (`superpowers:writing-plans`), then execute inline (subagent file-writes get denied here — implement yourself, use subagents for review).
5. Per-task commits; lint each; verify with `pnpm dev` build (not just vitest) because of gotcha #1.
