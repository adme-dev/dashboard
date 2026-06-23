# MCP Phase 2b — Video Generation suite over MCP — Design

**Date:** 2026-06-21
**Status:** Approved for planning (brainstorming complete)
**Builds on:** `docs/specs/ai-copilot-mcp-server-phase2.md` (§4 generation, §5 writes),
`docs/specs/ai-copilot-mcp-phase2-tasks.md` (§2b), handoff
`docs/superpowers/handoffs/2026-06-21-mcp-server-phase1-2-handoff.md`.
**Reuses dormant 2c machinery:** `ai_pending_actions` (mig 189), `proposeAction`/`confirm_action`.

---

## 1. Goal

Expose the agency's owned AI **video generation** engine to external MCP hosts (Claude / ChatGPT /
Cursor) as a small, self-contained **suite**: discover projects + models, propose a generation with a
cost + compliance preview, confirm to spend, and poll the result. Plus a from-zero ergonomics escape
hatch (`create_video_project`) so a pure chat host isn't blocked by the engine's hard requirement of a
pre-existing AV project.

The whole suite ships **dormant** behind flags and adds **no migration**.

## 2. The tension this resolves

`POST /api/agency/video/generation/jobs` requires an existing **AV `projectId` + timeline**, is gated by
a separate `VIDEO_GENERATION_ENABLED`, and **bills real money** against a hard per-tenant monthly cap
(atomic advisory-locked reservation). A conversational host has no UI to set a project up first, and an
external AI silently spending money is exactly the posture this codebase guards against.

**Resolution:**
- Add read-only **discovery** tools so the host can form a *valid* call (it can't guess model/duration/
  aspect-ratio).
- Make the spend a **propose → confirm** action (reusing the dormant 2c machinery): propose previews
  cost + compliance and spends nothing; a human `confirm_action` reserves budget + enqueues.
- Make the one state-creating escape hatch (`create_video_project`) a confirm-tier write too — never a
  silent create.

## 3. Architecture (mirror 2a exactly)

Two files, same split as `generationTools.ts` (pure) + `generationRunner.ts` (bindings):

- **`server/utils/ai/mcp/videoTools.ts`** — pure descriptors `videoTools: VideoToolDescriptor[]`,
  projection `projectVideoTools(role, flags)` (flag + role scope → MCP manifests), and the guard
  `executeVideoTool(name, args, ctx, deps)`. The guard mirrors `executeGenerationTool`: never throws,
  returns a typed outcome `{ ok:true, data } | { ok:false, error, code }` with
  `code ∈ disabled | not_found | forbidden | bad_args | handler_error`. PURE over an injected runner so
  the projection + guard are unit-testable with **no Cloudflare bindings**.
- **`server/utils/ai/mcp/videoRunner.ts`** — `buildVideoRunner()`, the binding-dependent half. Wraps the
  **existing** engine functions, driven by `ctx.userId` (resolved by the internal endpoint from the OAuth
  assertion) + `ctx.event` bindings:
  - `listProjects()` (`server/utils/audio/projects.ts`)
  - `listSelectableVideoGenerationModels()` + `selectableVideoModelOptions()` + `loadTenantVideoGenerationPolicy()`
  - `getProjectWithCurrentTimeline()`, `canUseVideoGenerationProject()`
  - `evaluateVideoGenerationCompliance()`, `estimateVideoGenerationCostCents()`
  - `reserveAndCreateVideoGenerationJob()`, `enqueueVideoGeneration()`, `resolveSourceAssetUrls()`
  - `getVideoGenerationJob()`, `listVideoGenerationJobsForProject()`
  - `createProject()` (for `create_video_project`)

**Wiring:**
- `server/api/internal/mcp/tools.post.ts` (manifest) adds video tools, each flag-gated per §5.
- `server/api/internal/mcp/call.post.ts` routes:
  - video **reads + status** → `executeVideoTool`,
  - `propose_video_generation` / `create_video_project` → the existing **propose** path (persist pending
    action), and `confirm_action` (already wired in 2c) dispatches the **executor**.
- **Worker (`workers/mcp-server/`) needs no change** — it proxies every manifest tool to `/internal/mcp/call`.

**No migration.** Reuses `video_generation_jobs`, `ai_pending_actions` (mig 189 — nullable
`conversation_id` + `source`), and `media_projects`.

## 4. The 6 tools

### 4.1 Reads — gated `MCP_VIDEO_TOOLS_ENABLED` (no spend, no writes)

| Tool | Wraps | Returns |
|---|---|---|
| `list_av_projects` | `listProjects()` filtered to `mediaType='av'` + `canUseVideoGenerationProject(actor, p)` (admin/owner → all; else own) | `[{ id, name, clientId, hasTimeline }]` |
| `list_video_models` | `selectableVideoModelOptions(listSelectableVideoGenerationModels())` + tenant policy. Optional `projectId` → tenant-specific policy/cap | `{ models: [{ id, modes, durationsSeconds, aspectRatios, resolutions, allowedSubjectTypes, requiresApprovedSourceAsset }], policy: { enabled, monthlyCapCents } }` |
| `list_video_generations` | `listVideoGenerationJobsForProject(projectId)` (project scope-checked) | recent jobs (status, mode, model, cost, createdAt) |
| `get_video_generation_status` | `getVideoGenerationJob(jobId)` (job's project scope-checked) | `{ jobId, status, providerStatus, outputAssetId, assetUrl, estimatedCostCents, actualCostCents, error }` |

All four require `CREATIVE` permission (same as 2a generation) and are role-scoped in the projection.

> **Decision:** dedicated `get_video_generation_status` rather than extending 2a's `get_generation_status`
> (spec §2b/B3 suggested extending). Rationale: keeps the video flag independent of
> `MCP_GEN_TOOLS_ENABLED`, and video job-ids live in a distinct store. A host polling a video job uses the
> video-suite tool.

### 4.2 Confirm-tier — gated `MCP_VIDEO_TOOLS_ENABLED` **AND** `MCP_VIDEO_GEN_ENABLED`, via 2c propose/confirm

**`propose_video_generation`**
- Params: `projectId` (uuid), `mode` (`text-to-video` | `image-to-video` | `video-extension` | `lip-sync`),
  `modelId`, `prompt` (≤4000), `sourceAssetIds: string[]` (default `[]`), `durationSeconds` (int, ≤60),
  `aspectRatio`, `resolution?`, `subjectType` (`vehicle` | `non_vehicle` | `unknown`, default `unknown`).
  **No host-supplied `idempotencyKey`** — derived from `proposalId` at confirm time.
- Behaviour (spends nothing):
  1. Resolve project → `not_found` if absent, `forbidden` if non-AV or not `canUseVideoGenerationProject`.
  2. Resolve model (`getVideoGenerationModel` + `isTenantModel`) and validate mode/duration/aspect/
     resolution/subject/source-required → `bad_args` on mismatch.
  3. Load source assets (i2v) → `bad_args` if unresolved/unapproved.
  4. `evaluateVideoGenerationCompliance(...)` → if **not allowed**, return a structured `blocked` outcome
     with reasons and **persist no confirmable proposal** (a blocked generation is terminal, not
     confirmable).
  5. `estimateVideoGenerationCostCents(model, durationSeconds)`.
  6. Persist an `ai_pending_actions` row via `proposeAction(ctx, null, …)` with the **fully-resolved
     payload** + `estimatedCostCents` + compliance classification, `source='mcp'`.
- Returns: `{ proposalId, estimatedCostCents, complianceClassification, resolvedModel, resolvedParams,
  expiresAt }`.

**`confirm_action(proposalId)`** (already wired in 2c; add the video executor)
- Atomic single-use claim (`UPDATE … WHERE id AND user_id AND status='proposed' AND source='mcp' AND not
  expired RETURNING …`) → `expired` outcome if already claimed/lapsed.
- Executor: re-checks permission, derives `idempotencyKey` from `proposalId`, calls
  `reserveAndCreateVideoGenerationJob(...)` (atomic budget lock) → on `402`/cap, return a terminal
  `cap_exceeded` outcome with `remainingCents` and **do not enqueue**; on success, `enqueueVideoGeneration`.
- Returns: `{ jobId, status }`. Host then polls `get_video_generation_status`.

**`create_video_project`** (full-suite "from zero")
- Params: `name`, `clientId?`. Propose → `confirm_action` → `createProject({ mediaType:'av', … })`.
- Returns (on confirm): `{ projectId }`. Lets a host create the target AV project behind a human confirm,
  so text-to-video works with zero prior in-app setup.

## 5. Flags (granular env, zero hot-path DB cost)

| Flag | Gates | Default |
|---|---|---|
| `MCP_VIDEO_TOOLS_ENABLED` | the whole suite's **reads + status** (4.1) | off (absent) |
| `MCP_VIDEO_GEN_ENABLED` | the **confirm-tier** actions `propose_video_generation` + `create_video_project` (4.2) | off (absent) |

Both live in `wrangler.toml [vars]` (NOT the CF dashboard — Direct-Upload `deployConfig` replaces
dashboard plaintext vars on every deploy; secrets survive). Env reads only — no DB lookup is added to the
manifest build or the per-call path.

**Granularity payoff:** video generation can be enabled **without** enabling 2c task/CRM writes
(`MCP_WRITE_TOOLS_ENABLED`), and vice versa. With `MCP_VIDEO_TOOLS_ENABLED` on but `MCP_VIDEO_GEN_ENABLED`
off, a host gets a safe **browse-only** suite (discover + poll, can't spend).

> **Decision:** dedicated `MCP_VIDEO_GEN_ENABLED` rather than piggybacking the generic
> `MCP_WRITE_TOOLS_ENABLED`. More granular; same performance.

## 6. Risk handling

- **Financial boundary.** Video generation spends money but is **explicitly not** in the 2c Xero-financial
  exclusion set (`budget_change` / `quote` / `eom_generate` / `budget_alert` / `expense_*`, held for D4).
  It is its own confirm action under its own flag. The projection + confirm make this boundary explicit so
  video is **neither** accidentally blocked by the financial exclusion **nor** accidentally enabled by the
  generic write flag.
- **Cost/compliance preview before spend.** `propose_video_generation` returns the estimate + classification
  and persists the resolved payload; nothing is reserved or enqueued until `confirm_action`.
- **Cap re-checked at confirm.** The per-tenant cap can move between propose and confirm, so the atomic
  reservation runs at confirm; `cap_exceeded` is terminal there (no enqueue).
- **No double-bill.** `idempotencyKey` derived from `proposalId` + 2c's atomic single-use claim → one
  execution per proposal even on double-confirm.
- **Rate limit (F5).** Existing 20/10min per-actor limit (`rateLimit.ts`, audit-ledger count) covers
  `propose_video_generation` + `create_video_project`; status polls exempt.
- **Audit.** All calls audited via the existing `/call` path (`payload.source='mcp'`, arg keys only).

## 7. Mode scope (v1)

`mode` passes through **all four** engine modes — the engine already validates combos per model. But v1
adds **no new source-asset upload tool**:
- **text-to-video** works from zero (prompt only).
- **image-to-video / video-extension / lip-sync** work only against **source assets already registered
  in-app** (host passes their ids, discovered/known out-of-band).

Building an "upload an image over MCP" tool is **deferred to v2** — real surface, and awkward for a chat
host. (If/when added, it is itself a confirm-tier write.)

## 8. Dependency callout (doubly-dormant)

Live-verify requires the **base** `VIDEO_GENERATION_ENABLED` to be baked into `wrangler.toml [vars]`
(currently **absent** → the engine 404s). Building the dormant slice does **not** need it; baking it in is
an operator step at go-live. So 2b is doubly-dormant: `MCP_VIDEO_TOOLS_ENABLED` / `MCP_VIDEO_GEN_ENABLED`
**and** `VIDEO_GENERATION_ENABLED`.

## 9. Tests (mirror 2a's 10 + 2c's 13)

- **Projection:** `projectVideoTools` flag-gating (video flag off → no tools; gen flag off → no
  propose/create; both off → empty); role scoping (non-CREATIVE → empty).
- **Guard:** `executeVideoTool` never throws — `disabled` / `not_found` / `forbidden` / `bad_args` /
  `handler_error`.
- **`propose_video_generation`:** project resolution (`not_found` absent, `forbidden` non-AV / non-owned);
  model/param validation → `bad_args`; compliance-blocked → `blocked`, **no confirmable proposal**; happy
  path → proposalId + `estimatedCostCents` present, nothing enqueued.
- **Confirm path:** `cap_exceeded` at confirm → terminal, **no enqueue**; happy path enqueues **once**;
  single-use claim (double confirm → `expired`).
- **`create_video_project`:** propose → confirm → project created; single-use claim.
- **Financial-exclusion boundary:** video actions **not** caught by the Xero-financial exclusion; gated by
  the video flags only.

## 10. Marketing / docs at go-live (per CLAUDE.md)

When the suite is activated, update the connector page (`app/pages/agency/ai/connectors.vue`) +
`features/ai-connectors` to list the newly-live video tools (today described as read-only/audio-gen).

## 11. Operator live-verify (after both flag sets + base `VIDEO_GENERATION_ENABLED`)

`list_video_models` → `propose_video_generation` (t2v) → confirm `estimatedCostCents` → `confirm_action`
→ poll `get_video_generation_status` until `succeeded` → confirm asset finalize + budget decrement +
`ai_action_audit` rows (`source='mcp'`).

## 12. Out of scope (this slice)

- Source-asset **upload** over MCP (i2v image ingestion) → v2.
- 2d banner render (separate slice; needs `banner-studio/export-video` async-ification + migration).
- 2c **financial** writes (D4).
