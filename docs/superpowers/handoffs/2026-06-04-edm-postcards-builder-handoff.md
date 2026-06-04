# EDM Postcards Builder Handoff (2026-06-04)

**Branch:** `feature/edm-postcards-builder`  
**Worktree:** `/Users/paulgiurin/Documents/Projects/dashboard/.worktrees/edm-postcards-builder`  
**Plan:** `docs/superpowers/plans/2026-06-04-edm-postcards-builder.md`  
**Spec:** `docs/superpowers/specs/2026-06-04-edm-postcards-builder-design.md`  
**Latest feature-code commit:** `4402d122 feat(email): add section inspector metadata`

This feature is being executed with `superpowers:subagent-driven-development`. Continue task-by-task with a fresh implementer, then a spec reviewer, then a code quality reviewer. Do not skip review gates.

---

## Read First

Run commands from the isolated worktree:

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/edm-postcards-builder
```

Use Node 24 explicitly:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run ...
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm run typecheck
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm dev
```

The default shell has previously used Node 20 and produced Vite/Vue failures such as `crypto.hash is not a function`.

The original checkout has unrelated social publishing changes. Ignore them. Do not revert anything outside this worktree.

---

## Current State

Tasks 1-3 are complete and passed both review gates.

Task 4 implementation is committed, but review gates have not run yet:

- Commit: `4402d122 feat(email): add section inspector metadata`
- Implementer: `019e90ea-20fc-73a3-bef7-cb83725c9dc4`
- Implementer status: `DONE_WITH_CONCERNS`
- Concern: repo-wide typecheck still has unrelated existing TypeScript failures; default heap OOM'd first, higher heap completed and failed on unrelated issues.
- Worktree was clean after the implementer's commit.

Next immediate action:

1. Verify worktree status.
2. Run Task 4 targeted test with Node 24.
3. Dispatch Task 4 spec reviewer over `b6e4123e..4402d122`.
4. If spec passes, dispatch Task 4 code quality reviewer.
5. If reviewers find Important/Critical issues, resume or re-dispatch the Task 4 implementer for fixes.

---

## Completed Commits

### Planning

- `923b47c2 docs: design edm postcards builder`
- `228d3667 docs: plan edm postcards builder`

### Task 1: Preset Catalog And Starter Documents

- `59aa1b6f feat(email): add edm section presets`
- `cb6f59c3 test(email): harden edm preset catalog`

Files:

- `app/utils/edmPresets.ts`
- `test/utils/edmPresets.test.ts`

Status: spec review passed, quality review passed, targeted tests passed.

### Task 2: Store Actions For Preset Insertion

- `2a800a30 feat(email): insert edm section presets`
- `958c2027 test(email): harden edm preset insertion`

Files:

- `app/composables/useEdmBuilder.ts`
- `test/utils/useEdmBuilderPresets.test.ts`

Status: spec review passed, quality review passed, targeted tests passed.

### Task 3: Client Preview Rendering For Custom Section Blocks

- `0c4aefd6 feat(email): preview edm section blocks`
- `440185cd test(email): enable vue component tests`
- `b7bdd085 fix(email): complete edm section previews`
- `9ea542c9 test(email): cover edm section preview copy`
- `b6e4123e fix(email): keep edm section preview styles reactive`

Files:

- `app/components/email/builder/EdmBlockRenderer.vue`
- `test/components/emailEdmBlockRenderer.test.ts`
- `vitest.config.ts`

Verified:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/components/emailEdmBlockRenderer.test.ts
```

Result: 1 file passed, 4 tests passed.

Remaining minor note: `headerStyle` and `footerStyle` preview backgrounds mostly derive from `style.backgroundColor`; server renderers and Task 4 metadata also model `backgroundColor` as a block prop. Presets duplicate the value into style, so this is not blocking. Consider aligning if touching the renderer again.

### Task 4: Metadata-Driven Inspector Controls

- `4402d122 feat(email): add section inspector metadata`

Files:

- `app/utils/edmSectionSettings.ts`
- `app/components/email/builder/BlockSettingsPanel.vue`
- `test/utils/edmSectionSettings.test.ts`

Implemented:

- Metadata definitions for `header`, `menu`, `hero-section`, `feature-grid`, `cta-banner`, and `footer`.
- Inspector branch that renders metadata-driven fields.
- Repeater controls for menu items and feature items.
- Updates flow through existing `updateProp`.

Implementer verification:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/edmSectionSettings.test.ts
```

Result: 3 tests passed.

Still pending: Task 4 spec review and quality review.

---

## Remaining Plan

### Finish Task 4 Reviews

Use base `b6e4123e` and head `HEAD`.

Spec review should verify:

- `getEdmSectionSettings('hero-section')` has field keys in the exact requested order.
- `menu` exposes `menu-items`.
- `feature-grid` exposes `feature-items`.
- primitive block types return `null`.
- `BlockSettingsPanel.vue` renders metadata-driven controls for custom sections and keeps primitive branches intact.

Quality review should check:

- No stale prop mutation or in-place array mutation problems.
- Repeater updates preserve other existing props.
- Number and boolean controls behave reasonably.
- UI branch placement does not hide shared padding controls.

### Task 5: Postcards-Style Builder Shell

Main files:

- `app/components/email/builder/EdmFlyhubBuilder.client.vue`
- `test/utils/useEdmBuilderPresets.test.ts`

Expected work:

- Replace the simple left palette with category list + section thumbnail rail.
- Keep Basic blocks available.
- Add `?starter=` loading through local starter templates.
- Update empty state and add-at-end popover.
- Add a store guard test that Basic insertion still works after section insertion.

Relevant tests:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/useEdmBuilderPresets.test.ts test/utils/edmPresets.test.ts test/components/emailEdmBlockRenderer.test.ts
```

### Task 6: Visual Template Gallery

Main file:

- `app/components/email/TemplatesPanel.vue`

Expected work:

- Import `EDM_STARTER_TEMPLATES`.
- Add blank template card.
- Add starter template cards.
- Preserve saved-template actions: open, duplicate, rename, delete.

Relevant test:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/edmPresets.test.ts
```

### Task 7: Final Verification And Browser Check

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/emailRenderDocument.test.ts test/utils/emailRenderHeading.test.ts test/utils/emailRenderMerge.test.ts test/utils/emailMarketingEmail.test.ts test/utils/emailCampaignFormat.test.ts test/utils/edmPresets.test.ts test/utils/useEdmBuilderPresets.test.ts test/utils/edmSectionSettings.test.ts test/components/emailEdmBlockRenderer.test.ts
```

Then:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm run typecheck
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm dev
```

Browser check:

- `/agency/email` shows starter template cards and blank template card.
- Starter opens `/agency/email/compose?starter=<id>`.
- Composer shows category list, section thumbnails, canvas, and inspector.
- Basic blocks still insert from Basic category.
- A custom section inserts and renders in editor preview.
- Preview mode renders server HTML without unknown-block fallback markup.
- Save modal still opens.

Stop the dev server cleanly afterwards.

---

## Subagent Notes

Closed Task 3 agents:

- Implementer: `019e90d6-6f0b-7963-9b4e-d3b13cae8eab`
- Spec reviewers: `019e90dd-b658-7f91-b9ce-3e060047af9b`, `019e90e0-b9e3-75a2-800b-6fa709965bf1`, `019e90e2-bb52-7902-97d6-bdeb8c589840`
- Quality reviewers: `019e90e3-e8a6-7501-9f98-3093b99f190d`, `019e90e7-8544-7833-be64-fdb01f4a3b8f`

Task 4 implementer completed:

- `019e90ea-20fc-73a3-bef7-cb83725c9dc4`

If review finds Task 4 issues, either resume that implementer by ID or spawn a fresh worker with the exact findings.

---

## Watchpoints

- Server custom block types use lowercase strings: `hero-section`, `feature-grid`, `cta-banner`.
- Primitive block types use PascalCase strings: `Heading`, `Text`, `Button`.
- `vitest.config.ts` now includes `@vitejs/plugin-vue`; this is intentional for direct SFC SSR tests.
- Do not add a new persistence model. Presets expand into normal flat `EdmFlyhubDocument` blocks.
- Do not copy Designmodo branding or proprietary templates. The goal is the builder pattern and ergonomics.
