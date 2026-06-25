# Creative Intelligence Studio Task List

## Overview

This task list decomposes the approved PRD into small, verifiable slices. Slice 1 foundation is already committed in `80ff3718`.

## Phase 1: Version Graph Adoption

### Task 1: Render Job Version Mapping

**Description:** Map existing Video Studio render jobs into creative version graph sources and surface derived version labels in the render jobs panel.

**Acceptance criteria:**
- [x] `MediaRenderJob` can be mapped to a `CreativeVersionSource`.
- [x] Done render jobs become `render` versions with variant metadata.
- [x] Failed render jobs become failed versions and are excluded from latest selection when a ready render exists.
- [x] Render jobs panel shows version/take context without changing API shape.

**Verification:**
- [x] `pnpm exec vitest run test/creative/versionGraph.test.ts test/video/renderJobSummary.test.ts test/components/videoStudioRenderJobsPanel.test.ts`
- [x] `pnpm exec eslint server/utils/creative/versionGraph.ts app/utils/video/renderJobSummary.ts app/components/media/VideoStudioRenderJobsPanel.vue test/creative/versionGraph.test.ts test/video/renderJobSummary.test.ts test/components/videoStudioRenderJobsPanel.test.ts`
- [x] `pnpm exec vue-tsc --noEmit --pretty false`

**Dependencies:** Slice 1 version graph foundation.

**Likely files:**
- `server/utils/creative/versionGraph.ts`
- `app/utils/video/renderJobSummary.ts`
- `app/components/media/VideoStudioRenderJobsPanel.vue`
- `test/creative/versionGraph.test.ts`
- `test/video/renderJobSummary.test.ts`
- `test/components/videoStudioRenderJobsPanel.test.ts`

**Estimated scope:** Medium.

### Task 2: Audio Asset Version Mapping

**Description:** Map voiceover and music assets into creative version graph sources for later Audio Studio takes and script chunking.

**Acceptance criteria:**
- [ ] Audio assets have deterministic version source ids.
- [ ] Music and voiceover metadata are preserved.
- [ ] Ready/done/failed/queued status mapping is tested.

**Verification:**
- [ ] `pnpm exec vitest run test/creative/versionGraph.test.ts test/audio/assets.test.ts`

**Dependencies:** Task 1.

**Estimated scope:** Small.

## Phase 2: Unified Job Center Foundation

### Task 3: Shared Creative Job Summary Contract

**Description:** Add a pure `creativeJobSummary` utility that maps render, generation, and audio jobs into one status model.

**Acceptance criteria:**
- [ ] Statuses normalize into `queued`, `running`, `ready`, `failed`, `blocked`.
- [ ] Retryability is explicit.
- [ ] Source-specific ids and labels are preserved.

**Verification:**
- [ ] Focused utility tests and typecheck.

**Dependencies:** Task 1.

**Estimated scope:** Medium.

### Task 4: Global Creative Job Strip

**Description:** Add a compact UI component that can display active and failed creative jobs from the shared job summary contract.

**Acceptance criteria:**
- [ ] Component renders active, failed, and completed groups.
- [ ] Existing Video Studio render job UI remains intact.
- [ ] Component is tested with SSR/component tests.

**Verification:**
- [ ] Component tests, lint, typecheck.

**Dependencies:** Task 3.

**Estimated scope:** Medium.

## Phase 3: Voicebox-Inspired Audio

### Task 5: Script Chunker

**Description:** Add a pure sentence-aware script chunking utility for long-form voiceover generation.

**Acceptance criteria:**
- [ ] Respects max chunk size.
- [ ] Preserves bracketed expressive tags.
- [ ] Handles common abbreviations and CJK punctuation.

**Verification:**
- [ ] Utility tests.

**Dependencies:** Task 2.

**Estimated scope:** Medium.

### Task 6: Voiceover Takes Metadata

**Description:** Attach generated voiceover chunks and retakes to version graph metadata.

**Acceptance criteria:**
- [ ] Takes can reference an original script/chunk group.
- [ ] Failed chunks are individually retryable in metadata.

**Verification:**
- [ ] Audio utility/API tests.

**Dependencies:** Task 5.

**Estimated scope:** Medium.

## Phase 4: Agent Timeline MCP

### Task 7: Read-Only Timeline Context Tool

**Description:** Add an MCP read tool that returns project, timeline, asset, render, and version graph context.

**Acceptance criteria:**
- [ ] Uses existing MCP scope checks.
- [ ] Does not mutate state.
- [ ] Includes stable clip and version ids.

**Verification:**
- [ ] MCP tool tests.

**Dependencies:** Task 1.

**Estimated scope:** Medium.

### Task 8: Timeline Write Proposal Tool

**Description:** Add propose-only timeline mutation tools for insert/trim/replace/add-overlay.

**Acceptance criteria:**
- [ ] No direct writes without confirmation.
- [ ] Proposed payloads are validated and audit-ready.
- [ ] Existing pending-action flow is reused.

**Verification:**
- [ ] MCP proposal and confirmation tests.

**Dependencies:** Task 7.

**Estimated scope:** Large, split before implementation.
