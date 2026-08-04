# Board Files Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, searchable board-level Files view that stores board documents and aggregates existing task evidence without duplicating it.

**Architecture:** A new `board_files` table owns board-wide documents. A focused server utility resolves boards, maps database rows, and provides the union of board files and task attachments; Nitro routes provide list, upload, download, and delete operations. A dedicated `BoardFilesView.vue` handles the user interface while `useBoardData`, `BoardHeader`, and `BoardContainer` only integrate the new view type.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Nitro/h3, Neon PostgreSQL, Cloudflare R2 storage utilities, Vitest, happy-dom.

## Global Constraints

- Use Nuxt UI v4 components for all controls and forms.
- Wrap upload fields in `UFormField`; use `UInput type="file"`, `USelect`, and `UTextarea` with full-width controls.
- All server imports use the `~~/server/utils/` alias.
- Require board access on every read/download and both write plus board access on mutations.
- Board documents and task attachments retain separate ownership and storage records.
- Apply the SQL migration automatically using the repository database connection.
- Update the public Boards feature content in the same PR.

---

### Task 1: Board file persistence and aggregation

**Files:**
- Create: `server/database/migrations/341_board_files_library.sql`
- Create: `server/utils/boardFiles.ts`
- Test: `test/server/utils/boardFiles.test.ts`
- Test: `test/config/boardFilesMigration.test.ts`

**Interfaces:**
- Produces: `resolveAccessibleBoard(event, boardId)`, `listBoardFiles(departmentId, user)`, `mapBoardFileRow(row, boardId)`, and the shared `BoardFileItem` type.

- [ ] Write a migration contract test that fails until the table has board/uploader foreign keys, category/source/checksum constraints, a per-board checksum uniqueness rule, and indexes.
- [ ] Run the migration contract test and confirm it fails because migration 341 does not exist.
- [ ] Add the additive migration and rerun the contract test.
- [ ] Write utility tests with literal database rows proving board and task files map to one camelCase response, Monday-mapped attachments report `source: 'monday'`, and counts remain correct.
- [ ] Run the utility test and confirm it fails because `boardFiles.ts` does not exist.
- [ ] Implement the minimal mapper and aggregation queries, then rerun both focused tests.
- [ ] Commit the persistence and aggregation slice.

### Task 2: Board file API boundary

**Files:**
- Create: `server/api/agency/boards/[id]/files/index.get.ts`
- Create: `server/api/agency/boards/[id]/files/index.post.ts`
- Create: `server/api/agency/boards/[id]/files/[fileId]/download.get.ts`
- Create: `server/api/agency/boards/[id]/files/[fileId].delete.ts`
- Test: `test/server/api/boardFilesApi.test.ts`

**Interfaces:**
- Consumes: board resolution, row mapping, central storage validation/upload/delete/download helpers.
- Produces: authenticated list/upload/download/delete HTTP handlers.

- [ ] Write route tests proving list access is board-scoped and returns summary data.
- [ ] Write upload tests for missing multipart data, invalid category, MIME/size rejection, duplicate checksum conflict, successful insert, and uploaded-object cleanup when insert fails.
- [ ] Write download tests proving the file ID must belong to the requested board and no caller storage key is used.
- [ ] Write deletion tests proving owners/admins can delete any board file, members can delete their own file, and members cannot delete another uploader's file.
- [ ] Run the route tests and confirm missing-route failures.
- [ ] Implement the four handlers with narrow error mapping and storage cleanup.
- [ ] Run the focused API tests and the existing storage-boundary suite.
- [ ] Commit the API slice.

### Task 3: Files view and board integration

**Files:**
- Create: `app/components/board/views/BoardFilesView.vue`
- Modify: `app/components/board/BoardContainer.vue`
- Modify: `app/components/board/BoardHeader.vue`
- Modify: `app/composables/useBoardData.ts`
- Modify: `app/types/index.ts`
- Test: `test/components/boardFilesView.test.ts`
- Test: `test/app/boardFilesViewIntegration.test.ts`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/agency/boards/:id/files` and `BoardFileItem` response shape.
- Produces: `openTask` events for task evidence and refreshes after upload/delete.

- [ ] Write component tests for board/task summary counts, search, scope/category filters, related-task navigation, multipart upload fields, server error feedback, and delete confirmation.
- [ ] Write integration tests proving `files` is a valid routed view, appears in the switcher, and renders through `BoardContainer`.
- [ ] Run both tests and confirm they fail because the view and type do not exist.
- [ ] Build the responsive view with `UInput`, `USelect`, `UTable`, `UModal`, `UFormField`, `UTextarea`, `UButton`, `UBadge`, skeleton, empty, and error states.
- [ ] Integrate the view and update route-query synchronization.
- [ ] Run the focused UI tests and fix only implementation defects.
- [ ] Commit the UI slice.

### Task 4: Public feature synchronization

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Test: `test/app/boardFilesMarketing.test.ts`

**Interfaces:**
- Produces: public Boards copy describing six connected views and board-level file discovery.

- [ ] Write a marketing contract test that fails until the Boards card and detail content mention the Files view.
- [ ] Update the Boards card and one of its four detailed sections without adding a redundant mega-menu entry.
- [ ] Run the marketing test and commit the public-page slice.

### Task 5: Migration, battle test, and PR

**Files:**
- Review every file changed by Tasks 1-4.

**Interfaces:**
- Produces: a verified branch and PR against `main`.

- [ ] Apply `341_board_files_library.sql` to the configured database using `psql` and verify the table/index definitions.
- [ ] Re-read every modified file and check aliases, permissions, duplicate UI, reactivity, file validation, storage cleanup, and dark/mobile states.
- [ ] Run all board-files focused tests and existing storage tests.
- [ ] Run the full Vitest suite.
- [ ] Run `pnpm typecheck`, separating pre-existing errors from feature regressions.
- [ ] Run `pnpm build` with Node 24.
- [ ] Start the app and browser-test Files at 320px and desktop width, including keyboard navigation, empty/error/upload states, and console errors.
- [ ] Review `git diff --check`, the final diff, and branch status.
- [ ] Commit remaining verification-safe changes, push `feature/board-files-library`, and create a PR against `main` using the repository PR template.
