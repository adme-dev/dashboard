# EDM Builder — Enterprise Epic Handoff (2026-06-04)

**Branch:** `feature/edm-postcards-builder`  **Worktree:** `/Users/paulgiurin/Documents/Projects/dashboard/.worktrees/edm-postcards-builder`
**Prod alias:** `agency-dashboard-6cm.pages.dev`  **Repo remote:** `adme-dev/dashboard` (push needs the `adme-dev` gh account — it's the active one)
**PRD:** `docs/superpowers/specs/2026-06-04-edm-enterprise-prd.md` (the source of truth for the roadmap)
**Surface:** `/agency/email` (templates tab) + `/agency/email/compose` (builder)

---

## How to work in this repo (critical gotchas)

- **Node 24 for everything:** `PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm …`. Default Node 20 → `crypto.hash is not a function`.
- **Run all builder work in the worktree** above (it's the feature branch). The MAIN checkout (`/Users/paulgiurin/Documents/Projects/dashboard`) has **unrelated uncommitted social-publishing WIP — do NOT disturb it, do NOT build/deploy from it** (it would ship that WIP). There's also an untracked `test/components/emailEdmBlockRenderer.test.ts.stray.bak` in main (a richer test variant left for reconciliation).
- **Deploy ONLY from the clean `.worktrees/deploy-prod` worktree** (real, non-symlinked node_modules → avoids the prerender-on-symlink failure):
  ```
  cd /Users/paulgiurin/Documents/Projects/dashboard
  git -C .worktrees/deploy-prod checkout <merge-commit-on-main>
  cd .worktrees/deploy-prod && PATH=…v24…/bin:$PATH pnpm install --frozen-lockfile
  PATH=…v24…/bin:$PATH pnpm deploy:production    # ~10 min: cold Nitro build (~8m) + wrangler --branch main
  ```
- **HMR staleness:** Nuxt dev does NOT reliably hot-reload (a) brand-new component files or (b) deep util files (`edmSectionBuilders.ts`). After such changes, **restart the dev server** (kill `lsof -ti tcp:3000 -sTCP:LISTEN`, relaunch `CHOKIDAR_USEPOLLING=true nohup pnpm dev`). Cold Nitro build ≈ 8 min. Server binds IPv6 — curl `http://[::1]:3000`, not 127.0.0.1.
- **Eyeball via the user's browser** (auth-gated): kimi-webbridge daemon at `127.0.0.1:10086` drives the user's real session. Navigate → dispatch `mouseenter`/`click` via `evaluate` → `screenshot` (path → Read). Prod has the user's session too — eyeballing prod is the reliable verify (local can be stale).
- **Merge flow:** merge into main from the MAIN checkout (`git merge --no-ff feature/edm-postcards-builder`). No overlap with the WIP (feature only touches email/edm files), so it's clean. Then `git push origin main`, then deploy from deploy-prod.
- **Build:** subagent-driven-development (per-task spec + quality review gates). Tests = Vitest (Node 24).

## Renderer & content rules (don't break these)
- **Intersection rule:** every block `type` must render in BOTH `app/components/email/builder/EdmBlockRenderer.vue` (editor/thumbnail) AND `server/utils/email-marketing/render/blocks/*` (server). Server supports MORE types than the editor — a preset can pass the server no-fallback test but show "Unknown block" in the editor/thumbnail. Editor branches exist for: header, menu, hero-section, feature-grid, cta-banner, footer, next-steps, Container, ColumnsContainer + primitives (Heading/Text/Button/Image/Avatar/Spacer/Divider/Html). **Rich multi-column/image layouts = `Html` blocks** (built via `app/utils/edmSectionBuilders.ts`).
- **Imagery:** Lorem Picsum (`picsum(seed,w,h)`) ONLY for real photography (blog/story/product/hero); **logos = grayscale text wordmarks**; **icons = CSS colored squares**. No third-party trademarks/assets. `loading="lazy"` on builder imgs. Flyout shows a "placeholder images — swap before sending" notice.
- **No persistence-format change** so far (flat `EdmFlyhubDocument`). Phase 3c will add additive/optional per-device props (backwards-compat required).
- **Never** flip `EMAIL_SENDING_ENABLED` / trigger a live send.

---

## ✅ Shipped to PROD this session (all verified)

Full EDM Postcards builder, deployed in successive merges to `origin/main` + prod:
1. **Tasks 1–8** (builder shell, presets, inspector metadata, gallery, hover flyout, live thumbnails) — merge `6d198f6c`, deploy `ac1349dd`.
2. **Task 9 rich library + Postcards mimic** (image-driven `edmSectionBuilders.ts`; 6–9 section presets/category; overlay blog cards, grayscale wordmark logos, services grid, "See all" pills) — merge `388a5d69`, deploy `9f0cb4e9`.
3. **image-story photo fix** — merge `19de3ada`, deploy `2832d3b8`.
4. **Unified "Add module" bubble** (Basic icon grid + section categories, on empty-state + end-of-canvas) — merge `4d3dfa8d`, deploy `1f1718da`. Component `app/components/email/builder/EdmAddModuleMenu.vue`.
5. **Enterprise PRD** (`docs/superpowers/specs/2026-06-04-edm-enterprise-prd.md`) + **Phase 1 Templates gallery** — merge **`8ea8734c`**, deploy **in progress** (check `/tmp/edm-deploy6.log` → `agency-dashboard-6cm.pages.dev` 200).
   - 12 starter templates (`EDM_STARTER_TEMPLATES`, with `usage/style/industry/isNew`), `EdmTemplateThumbnail.vue` (live full-doc preview), `TemplatesPanel.vue` reworked with Usage/Style filter chips + search + live previews + NEW badges; saved-template actions preserved.

Eyeballed on prod (via webbridge): hover flyout, overlay blog cards, grayscale logos, and the Add-module bubble (Basic grid default) all render correctly.

---

## ▶️ NEXT — remaining roadmap (see PRD for detail)

**Phase 1 leftovers (small):**
- **T1.5** Marketing-page sync (`app/pages/features/index.vue` + `[slug].vue` email-builder entry) — mention the template library/filters. (Deferred; flagged by review per the Front-Facing Page Sync rule.)
- **Phase 1b** (optional): folders + drafts grouping — needs persistence; deferred.
- Minor review nits: "Your templates" is a list (spec suggested grid w/ previews); `EdmTemplateThumbnail` uses index `:key`.

**Phase 2 — Custom Modules (save sections):** DB table `edm_custom_modules` + API (`server/api/agency/email/modules/*`, org-scoped, RBAC) + "Save as module" UI + a "Custom Modules" palette category fed by the API. Tasks T2.1–T2.5 in the PRD.

**Phase 3 — Enterprise editing UX (the big epic):**
- **3a** Rich per-element inspector (box model, full typography, border, shadow, link, opacity, anchor) — extend `BlockSettingsPanel.vue` + `edmSectionSettings.ts`; AUDIT + align both renderers for newly-editable props (some are hardcoded today, e.g. footer text color `#6b7280`).
- **3b** Inline WYSIWYG canvas editing + element toolbars (contenteditable, drag/duplicate/delete).
- **3c** Responsive Mobile/Desktop per-device overrides + hide-on-device — **additive persisted-format change** (backwards-compat tests required); both renderers device-aware.
Recommended order: T1.5 → Phase 2 → 3a → 3b → 3c.

## Key files
- `app/utils/edmPresets.ts` — section presets, `EDM_SECTION_PRESET_IDS`/`EdmSectionPresetId`, starter templates, `buildStarterTemplateDocument`.
- `app/utils/edmSectionBuilders.ts` — image-driven Html builders + native-block builders (`picsum`, `blogCardRow`, `clientLogoStrip`, `storyGrid`, `servicesGrid`, `heroImage`, `ctaBanner`, `featureRow`, `richFooter`, `productRow`/`productCard`, `imageTextRow`, `navMenu`, `brandHeader`).
- `app/components/email/builder/` — `EdmFlyhubBuilder.client.vue` (composer: flyout + add-module bubble), `EdmBlockRenderer.vue` (editor renderer), `EdmSectionThumbnail.vue`, `EdmTemplateThumbnail.vue`, `EdmAddModuleMenu.vue`, `BlockSettingsPanel.vue` (inspector).
- `app/components/email/TemplatesPanel.vue` — templates gallery.
- `server/utils/email-marketing/render/*` — server renderer.
- Tests: `test/utils/edm*.test.ts`, `test/components/emailEdm*.test.ts` (~70 EDM tests; render-no-fallback + no-"Unknown block" loops over ALL presets/starters).

## State
- Feature branch `feature/edm-postcards-builder` = main (fully merged at `8ea8734c`). Worktree clean.
- Memory: `~/.claude/projects/-Users-paulgiurin-Documents-Projects-dashboard/memory/edm-postcards-builder.md` (+ MEMORY.md index) — update after Phase 2/3.
- Local dev server may be running on `:3000` (restart if stale per the HMR note).
