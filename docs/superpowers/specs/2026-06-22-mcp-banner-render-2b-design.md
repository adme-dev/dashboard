# Design — Banner render over MCP (#2b)

**Date:** 2026-06-22 · **Status:** design (awaiting review) · **Owner:** agent build
**Roadmap:** sub-project **#2b** of "build the other missing MCPs". Builds on **#2a** (async banner render pipeline, built) and mirrors the existing **2b video** MCP tools.

## 1. Goal & context

Expose Banner Studio MP4 rendering to external AI hosts over MCP. A host names a banner **project + format**; the server
generates the renderable HTML and drives the **#2a** async pipeline (`banner_render_jobs` + `BANNER_RENDER_QUEUE` →
`audio-jobs` Chromium/ffmpeg container → R2 + `banner_exports`). This mirrors the 2b **video** MCP tools
(`server/utils/ai/mcp/videoTools.ts` + `videoRunner.ts`): discovery reads + a confirm-tier propose/confirm write +
a status read.

**Key feasibility fact (validated):** the server builds the renderable HTML from a named project via two existing
server-side helpers (already used by `server/api/agency/audio/projects/[id]/render-video.post.ts`):
- `loadBannerLayers(projectId, formatKey)` → `{ layers, width, height }` (`server/utils/audio/bannerOverlay.ts`) — loads
  the project's layers for a format from `banner_projects.canvas_data` and supplies dims; throws if the format isn't on the project.
- `buildBannerHTML(format, layers, options)` (`server/utils/banner/htmlBuilder.ts`) — **note arg order: format FIRST** — produces the GSAP HTML.

So the MCP host does **not** supply HTML (it can't) — the server builds it from the named project. This is what makes #2b possible.

**Scope:** MP4 render of an existing banner-studio project, over MCP. **Non-goals:** GIF/image over MCP; creating/editing
banner projects over MCP; per-render billing/caps (V1 uses our own container compute — see §4); any new migration.

## 2. Tool surface (role-gated, dormant behind `MCP_BANNER_TOOLS_ENABLED`)

All mirror the 2b video tool patterns; descriptors in a new `server/utils/ai/mcp/bannerTools.ts`, confirm dispatch in
`server/utils/ai/mcp/bannerRunner.ts`.

1. **`list_banner_projects`** (read) — discovery: `{ projects: [{ id, name, formats: string[], updatedAt }] }` for the
   actor's scope. Mirrors `list_av_projects`. Project names are untrusted text.
2. **`propose_banner_render`** (confirm-tier write) — args `{ project: string (name or id), format: string, fps?: 12–60,
   quality?: 1|2 }`. Resolves the project, validates the format exists on it, then persists an `ai_pending_actions`
   proposal (`source='mcp'`, `conversation_id` NULL — reusing mig 189) with the resolved payload `{ projectId, format,
   fps, quality }`. Returns `{ proposalId, summary: { project, format } }`. Does NOT render yet.
3. **`confirm_action`** (existing tool) → **bannerDispatch** (new hook, parallel to `videoDispatch` in
   `writeTools.ts`): atomically claims the proposal, then `const { layers, width, height } = await
   loadBannerLayers(projectId, format)` → `const html = buildBannerHTML(format, layers, { baseUrl })` →
   `enqueueBannerRender({ projectId, formats:[{ key: format, html, width, height }], fps, quality, userId }, deps)`
   (the #2a Pages-side enqueue) → returns `{ jobIds }`.
4. **`get_banner_render_status`** (read) — args `{ jobIds: string[] }` → reuses `projectJobStatus` over a
   `banner_render_jobs` query → `[{ jobId, formatKey, status, url?, error? }]`. Mirrors `get_video_generation_status`.

## 3. Wiring
- `server/api/internal/mcp/tools.post.ts` — add the 3 banner descriptors to the manifest, **flag-gated** on
  `MCP_BANNER_TOOLS_ENABLED` (reads + propose), exactly as the video tools are gated on `MCP_VIDEO_TOOLS_ENABLED`.
- `server/api/internal/mcp/call.post.ts` — route `list_banner_projects` / `get_banner_render_status` (reads) and
  `propose_banner_render` (propose). `confirm_action` already routes through `executeWriteConfirm`; add `bannerDispatch`
  to its `ConfirmDeps` so a claimed banner proposal dispatches to `bannerRunner`. `confirm_action` is available when ANY
  confirm-tier group is on (write OR video OR **now banner**) — extend that gate.
- `server/utils/ai/mcp/writeTools.ts` — add an optional `bannerDispatch?: (row, ctx) => Promise<WriteConfirmOutcome | null>`
  to `ConfirmDeps`, tried before the 2c safe-action path (same shape as `videoDispatch`; returns null for non-banner
  tool_names so other paths still work).
- Worker: **no change** — the #2a `banner-render` branch already renders whatever lands in `banner_render_jobs`.

## 4. Decisions (flagged for review)
- **RBAC → `CREATIVE`** (Banner Studio is a creative tool; `PERMISSIONS.CREATIVE` = owner/admin/lead/PM/creative/producer).
  The reads, propose, and confirm all re-check `CREATIVE`. *(Adjustable to MANAGEMENT if you want it tighter.)*
- **Non-financial; explicitly NOT D4.** Banner render runs on our own CF container compute (no per-render external
  charge, unlike video gen's AI-Gateway credits). So **no per-client cap / budget gate in V1.** A confirm-tier write
  (human/host must confirm) is the only gate. *(A cap can be added later if container cost becomes material.)*
- **No new migration** — reuses `banner_render_jobs` (#2a) and `ai_pending_actions` (mig 189).
- **Two activation gates:** `MCP_BANNER_TOOLS_ENABLED='true'` **and** the #2a pipeline activated (queues + container).
  With the flag on but #2a not activated, `propose`→`confirm` enqueues but the job sits `queued` (no consumer) — so
  activate #2a first. Until the flag is on, the tools aren't even listed.

## 5. Security
- `propose_banner_render` resolves the project under the actor's scope; never trusts a host-supplied projectId without a
  scoped lookup. The generated HTML is rendered in the same sandboxed, stateless container as the in-app path (same
  surface — the HTML is built by OUR `buildBannerHTML` from stored layers, not host-supplied, so it's *lower* risk than
  the in-app client-HTML path).
- `confirm_action` keeps the existing atomic single-use claim (`status='proposed' AND source='mcp' AND not expired`),
  permission re-check at dispatch, and audit row (`source='mcp'`).
- Reads return compact projections; project/job text marked untrusted.

## 6. Testing (TDD)
- `bannerTools.ts` (pure descriptors + propose resolver, injected deps): list projection; propose validates project +
  format and persists the right payload; bad project/format → typed fail; descriptors are correct tier/permission/untrusted.
- `bannerRunner.ts` (pure dispatch, injected deps): claimed proposal → loads layers → buildBannerHTML called with the
  right args → enqueue called with the generated HTML + dims → returns jobIds; missing project at confirm → graceful fail.
- Manifest/projection assertion: the 3 tools appear only when `MCP_BANNER_TOOLS_ENABLED`; `propose_banner_render` is
  confirm-tier; reads are read-only.
- `buildBannerHTML` itself is pre-existing/tested; the container render stays operator-verify-live (#2a).
- Full `test/ai/` green, no regressions.

## 7. Rollout
No migration, no worker change. Ships behind `MCP_BANNER_TOOLS_ENABLED` (off). Live banner-over-MCP requires: flag on +
#2a pipeline activated (queues + container deployed). Then verify-live one `propose_banner_render → confirm → poll →
asset` from a Claude host. Marketing/connector copy + `mcp-server-guide.md` capability list get a follow-up note.

## 8. Implementation map (validated — for the plan)
Exact building blocks confirmed in-repo (signatures verified):
- **Mirror:** `server/utils/ai/mcp/videoTools.ts` (descriptors `VideoToolDescriptor`; `projectVideoReadTools(role, suiteEnabled)`
  + `projectVideoTools(role, flags)` manifests; `executeVideoTool(...)`; `videoProposeTools` + `executeVideoPropose(...)`;
  `VIDEO_CONFIRM_ACTIONS`/`resolveVideoProposeAction`) and `videoRunner.ts` (`buildVideoReadRunner`, `buildVideoProposeDeps`,
  `buildVideoConfirmDeps`). New files `bannerTools.ts` + `bannerRunner.ts` mirror these, scaled to 3 tools.
- **Confirm dispatch chain (banner):**
  `const { layers, width, height } = await loadBannerLayers(projectId, format)` (`~~/server/utils/audio/bannerOverlay.ts`)
  → `const html = buildBannerHTML(format, layers, { baseUrl })` (`~~/server/utils/banner/htmlBuilder.ts`, **format first**)
  → `enqueueBannerRender({ projectId, formats:[{ key: format, html, width, height }], fps, quality, userId }, deps)`
  (`~~/server/utils/banner/renderJob.ts`, from #2a). `loadBannerLayers` throws if the format isn't on the project → graceful fail.
- **Dims/format validation:** `FORMATS` (`~~/app/utils/banner-constants.ts`, `Record<string,{key,w,h,name,...}>`) for the
  `list_banner_projects` formats + propose-time validation; `loadBannerLayers` re-validates at confirm.
- **Propose persist:** `proposeAction(ctx, null, action, payload)` (`~~/server/utils/ai/pendingActions.ts`) with
  `action='banner_render'`, payload `{ projectId, format, fps, quality }`, `source='mcp'` (mig 189).
- **Confirm wiring:** add `bannerDispatch?` to `ConfirmDeps` in `writeTools.ts` (parallel to `videoDispatch`, tried before
  the 2c safe-action path, returns null for non-banner tool_names); `confirm_action` enabled when ANY confirm group is on.
- **Status read:** reuse `projectJobStatus` (`~~/server/utils/banner/renderJob.ts`) over a `banner_render_jobs` query by jobIds.
- **Flag:** `MCP_BANNER_TOOLS_ENABLED` (wrangler.toml `[vars]`, baked at deploy like `MCP_VIDEO_TOOLS_ENABLED`).
- **Endpoints to edit:** `server/api/internal/mcp/tools.post.ts` (manifest, flag-gated) + `call.post.ts` (route reads/propose;
  add `bannerDispatch` to the confirm deps). RBAC `CREATIVE` re-checked in tools + at dispatch.
