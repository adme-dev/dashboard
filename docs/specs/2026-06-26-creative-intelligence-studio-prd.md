# Creative Intelligence Studio PRD

**Date:** 2026-06-26
**Status:** Approved for phased implementation
**Owner:** Product/Engineering
**Feature area:** Creative > Video Studio, Banner Studio, Audio Studio, MCP
**Reference projects:**
- Palmier Pro: https://github.com/palmier-io/palmier-pro
- Voicebox: https://github.com/jamiepine/voicebox
**Related docs:**
- `docs/specs/2026-06-25-hyperframes-render-runtime-prd.md`
- `docs/specs/2026-06-19-video-studio-enterprise-redesign-prd.md`
- `docs/superpowers/specs/2026-06-18-video-studio-unified-producer-prd.md`
- `docs/engagr-ai-media-studio-video-v1-roadmap.md`

## Objective

Upgrade the creative production system so Video Studio, Banner Studio, and Audio Studio behave like one agent-ready production environment.

Palmier Pro shows the value of an AI-native editor where agents can inspect and safely mutate a real timeline through MCP. Voicebox shows the value of a complete voice I/O loop: versioned generations, captures, long-form chunking, profile defaults, visible async status, and API/MCP-first integration.

This PRD does not propose copying either app. Palmier Pro is GPL-3.0, so it is used only for product and architecture inspiration. Voicebox is MIT, but its stack is Tauri/FastAPI/local inference while this platform is Nuxt, Cloudflare Pages, Workers, Queues, R2, Neon, and browser-based studios.

Success means users and agents can create, inspect, version, retry, render, and publish creative assets through consistent primitives across the existing studios.

## Product Goals

1. **Version every creative output**
   Generated clips, voiceovers, music, banner exports, video renders, derivatives, and platform exports should have explicit lineage, not just loose rows in separate tables.

2. **Make jobs visible in one place**
   Render, generation, upload, transcription, publishing, and preparation jobs should share a unified status model and UI surface.

3. **Turn captures into source material**
   Uploaded audio/video/stills, extracted frames, transcripts, generated voiceovers, client review notes, and prompt history should be promotable into timeline-ready assets.

4. **Let agents work with timelines safely**
   MCP tools should read project state, propose timeline edits, and apply confirmed, undoable mutations. Agents should not need hidden UI context to understand the active project.

5. **Route models by capability**
   Model selection should be driven by task requirements such as image-to-video, text-to-video, source-image requirement, aspect ratio, cost, duration, brand safety, and language support.

6. **Preserve governance**
   Tenant policy, Cloudflare AI Gateway routing, budget caps, compliance checks, human confirmation, portal scope, and audit trails remain mandatory.

## Non-Goals

- Replace Video Studio, Banner Studio, or Audio Studio.
- Build a native desktop app.
- Copy Palmier Pro implementation code.
- Import Voicebox's Tauri/FastAPI/local model runtime.
- Expose destructive MCP timeline writes without confirmation and audit.
- Bypass existing AI Gateway, provider allowlist, compliance, budget, or client-scope checks.
- Rebuild all UI surfaces in one release.

## Users

### Agency Operator

Needs to produce client creative quickly, compare takes, recover failed jobs, and send approved outputs to portal or publishing flows.

### Creative Lead

Needs traceable originals, retakes, platform exports, and review-ready versions without losing source provenance.

### Account Manager

Needs simple status visibility and confidence that the right version was sent to a client or publisher.

### Agent / MCP Client

Needs structured project context, stable asset and timeline references, and safe mutation APIs.

## Phased Scope

### Slice 1: Creative Version Graph

Create shared primitives for modeling creative outputs as a version graph.

Version node examples:
- Original generated video clip.
- Retake from the same prompt with a new seed.
- Effects version from an original.
- Platform export from a render job.
- Banner MP4 export from a banner project.
- Voiceover take from a script chunk.

Core fields:
- Stable `id`.
- `assetType`: `audio`, `video`, `banner`, `render`, `caption`, `capture`, or `unknown`.
- `versionKind`: `original`, `take`, `effect`, `platform_export`, `render`, `derivative`, `transcript`, or `capture`.
- `sourceRef`: table/source identifier and id.
- `parentIds`.
- `rootId`.
- `lineageDepth`.
- `label`.
- `status`.
- `favorite`.
- `createdAt`.
- `metadata`.

Acceptance:
- Pure graph builder normalizes heterogeneous version sources.
- Roots and parent-child relationships are deterministic.
- Cycles and missing parents are reported as validation findings.
- Favorites and latest versions can be derived without DB I/O.
- Unit tests cover graph construction, lineage, cycle detection, latest selection, and source mapping.

### Slice 2: Unified Creative Job Center

Create one status contract for creative jobs:
- video generation
- audio generation
- banner render
- video render
- upload/transcode
- transcription
- publishing

Acceptance:
- Job rows map into one typed status model.
- UI can show active, retryable, failed, and completed creative jobs from one composable.
- Existing job-specific panels remain but can consume the shared summary.

### Slice 3: Script Chunking and Voiceover Takes

Add sentence-aware long-form voiceover chunking:
- max chunk size
- abbreviation-aware sentence splitting
- CJK punctuation handling
- tag preservation
- per-chunk retry
- crossfade-compatible output metadata
- grouped takes

Acceptance:
- Long scripts generate multiple linked voiceover takes.
- Failed chunks can retry without regenerating successful chunks.
- Generated assets attach to the version graph.

### Slice 4: Creative Captures Library

Capture and reuse creative input material:
- uploaded media
- recordings
- transcripts
- extracted frames
- prompts
- review comments
- generated asset references

Acceptance:
- Captures are searchable and promotable to studio assets.
- Captures can become source assets for Video Studio generation or timeline insertion.

### Slice 5: Agent Timeline MCP

Expose safe timeline tools:
- `list_video_projects`
- `get_creative_project_context`
- `get_timeline`
- `propose_insert_clip`
- `propose_trim_clip`
- `propose_replace_asset`
- `propose_add_banner_overlay`
- `confirm_timeline_action`

Acceptance:
- Reads are available with existing MCP scope rules.
- Writes are propose/confirm only.
- Mutations are audit logged and undoable.
- Agents see stable clip, asset, range, and version ids.

### Slice 6: Capability-Based Model Router

Add a model capability resolver:
- required mode
- source asset rules
- duration
- aspect ratio
- resolution
- cost estimate
- language
- brand/compliance constraints
- provider availability

Acceptance:
- Video Generation UI and MCP tools can ask for capabilities rather than hardcoding model ids.
- Hidden/internal/disabled models remain fail-closed.
- Returned model options explain why each option is available or unavailable.

## Data and API Principles

- Keep each slice additive and backward-compatible.
- Prefer pure mapping and validation utilities before DB/API changes.
- Use existing tables where practical, then add shared metadata tables only when the product needs persisted cross-studio views.
- Never make UI state the source of truth for version lineage.
- Preserve original assets; derived versions must not overwrite originals.

## Testing Strategy

- Unit-test pure graph, routing, and chunking utilities.
- Integration-test DB/API additions with mocked DB runners where existing patterns allow.
- Component-test job center and version list UI before browser testing.
- Use full build/typecheck before commits that affect shared studio code.

## Rollout

1. Land Slice 1 as pure core plus tests.
2. Wire version graph reads into one existing surface.
3. Add persistence/API only after the shape is proven.
4. Ship each later slice behind existing feature gates where applicable.

## Open Questions

- Which UI should receive the first version graph view: Video Studio render jobs, Audio Studio assets, or Banner Studio export/version history?
- Should the shared persisted table be one `creative_versions` table, or should we keep source-specific tables and expose a virtual graph first?
- Should agent write tools launch with timeline-only scope, or also support Banner Studio layer edits in the same phase?
