# Creative Version Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Creative Intelligence Studio slice: a pure shared version graph core for creative assets, renders, generations, takes, and derivatives.

**Architecture:** Add a small, pure utility under `server/utils/creative/` that accepts source rows from existing studio tables and returns deterministic graph nodes, relationships, roots, latest versions, favorites, and validation findings. Keep this slice DB-free so later API/UI work can reuse it without migrations.

**Tech Stack:** TypeScript, Vitest, existing Nuxt server utility conventions.

---

## File Structure

- Create `server/utils/creative/versionGraph.ts`
  - Owns version graph types, source normalization, validation, root/depth derivation, and selectors.
- Create `test/creative/versionGraph.test.ts`
  - Covers graph construction, roots, parent-child relationships, cycle detection, latest selection, favorites, and source mapping.
- Reference `docs/specs/2026-06-26-creative-intelligence-studio-prd.md`
  - Product source of truth for later slices.

## Task 1: Version Graph Core

**Files:**
- Create: `test/creative/versionGraph.test.ts`
- Create: `server/utils/creative/versionGraph.ts`

- [x] **Step 1: Write failing tests**

Create tests that import:

```ts
import {
  buildCreativeVersionGraph,
  latestVersionForRoot,
  mapAudioAssetToVersionSource,
  mapVideoGenerationJobToVersionSource,
  favoriteVersions
} from '~~/server/utils/creative/versionGraph'
```

Test cases:
- Builds roots and child relationships from `original -> take -> platform_export`.
- Reports missing parent findings.
- Reports cycle findings.
- Selects latest non-failed version per root.
- Maps audio assets and video generation jobs into version sources.
- Returns favorite versions sorted newest first.

- [x] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm exec vitest run test/creative/versionGraph.test.ts
```

Expected: FAIL because `server/utils/creative/versionGraph.ts` does not exist yet.

- [x] **Step 3: Implement pure version graph utility**

Create:

```ts
export type CreativeAssetType = 'audio' | 'video' | 'banner' | 'render' | 'caption' | 'capture' | 'unknown'
export type CreativeVersionKind = 'original' | 'take' | 'effect' | 'platform_export' | 'render' | 'derivative' | 'transcript' | 'capture'
export type CreativeVersionStatus = 'queued' | 'running' | 'ready' | 'failed' | 'blocked' | 'archived'
```

Implement:
- `buildCreativeVersionGraph(sources)`
- `latestVersionForRoot(graph, rootId)`
- `favoriteVersions(graph)`
- `mapAudioAssetToVersionSource(row)`
- `mapVideoGenerationJobToVersionSource(row)`

Validation behavior:
- Missing parent: finding code `missing_parent`, severity `warning`.
- Cycle: finding code `cycle`, severity `error`.
- Unknown parent roots should fall back to the node id.
- Failed/blocked nodes are excluded from latest selection unless every candidate is failed/blocked.

- [x] **Step 4: Run focused tests**

Run:

```bash
pnpm exec vitest run test/creative/versionGraph.test.ts
```

Expected: PASS.

- [x] **Step 5: Run lint/typecheck for touched files**

Run:

```bash
pnpm exec eslint server/utils/creative/versionGraph.ts test/creative/versionGraph.test.ts
pnpm exec vue-tsc --noEmit --pretty false
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

Stage only PRD, plan, utility, and test files:

```bash
git add docs/specs/2026-06-26-creative-intelligence-studio-prd.md docs/superpowers/plans/2026-06-26-creative-version-graph.md server/utils/creative/versionGraph.ts test/creative/versionGraph.test.ts
git commit -m "feat(creative): add version graph foundation"
```
