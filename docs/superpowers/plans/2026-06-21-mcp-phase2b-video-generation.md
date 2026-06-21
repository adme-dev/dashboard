# MCP Phase 2b — Video Generation Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (subagent file writes are denied in this environment — execute inline, use subagents only for review). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the owned video-generation engine to external MCP hosts as a 6-tool suite — discovery reads + a confirm-tier `propose_video_generation` and `create_video_project` — all dormant behind flags, no migration.

**Architecture:** Mirror the 2a generation pattern exactly: a PURE descriptors/projection/guard module (`videoTools.ts`, unit-testable with injected deps) + a binding-dependent runner (`videoRunner.ts`). Confirm-tier actions reuse the dormant 2c infrastructure (`ai_pending_actions` mig 189, `proposeAction`, the atomic `confirm_action` claim) but with **video-specific** propose handlers + a dedicated `videoDispatch` (the in-app `registry`/`getExecutor` path is NOT reused — video tools have no in-app chat equivalent).

**Tech Stack:** Nitro (h3) server utils, Zod, `@neondatabase/serverless` (`queryOne`/`queryRows`/`transaction`), Vitest. Reuses `server/utils/video-generation/*` engine + `server/utils/audio/projects.ts` + `server/utils/ai/pendingActions.ts`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-21-mcp-phase2b-video-generation-design.md` (verbatim source of truth).
- **No migration.** Reuse `video_generation_jobs`, `ai_pending_actions` (mig 189), `media_projects`.
- **Two flags, env-only, in `wrangler.toml [vars]`** (NOT the CF dashboard): `MCP_VIDEO_TOOLS_ENABLED` (suite reads + status), `MCP_VIDEO_GEN_ENABLED` (the two confirm-tier actions). Both default off (absent). Ship **commented-out** (dormant).
- **Permission:** every video tool requires `CREATIVE` (use `roleHasPermission(role, 'CREATIVE')`), same as 2a.
- **Never throws.** Every guard/propose/confirm returns a typed outcome `{ ok:true, data } | { ok:false, error, code }`.
- **Pending-action tool_names:** `video_generation` (generation) and `video_project_create` (project create). These are the `ai_pending_actions.tool_name` values and the `dispatchVideoConfirm` routing keys. They are deliberately NOT in `MCP_WRITE_SAFE_ACTIONS` and NOT registered in `executors/index.ts`.
- **Financial boundary:** video spend is its own confirm action gated by its own flags — never reached via the generic `MCP_WRITE_TOOLS_ENABLED` 2c path, never caught by the Xero-financial exclusion.
- **Audit:** all calls already audited by the existing `/call` path (`payload.source='mcp'`, arg keys only) — no change needed.
- **Test command:** `npx vitest run test/ai/` (placement: `test/ai/mcpVideoTools.test.ts`).
- **Reference patterns:** `server/utils/ai/mcp/generationTools.ts` (pure+guard), `generationRunner.ts` (bindings), `writeTools.ts` (injected confirm), `test/ai/mcpGenerationTools.test.ts` + `test/ai/mcpWriteTools.test.ts` (test style).

---

## File Structure

| File | Responsibility |
|---|---|
| `server/utils/ai/mcp/videoTools.ts` *(create)* | PURE: read+propose descriptors; `projectVideoTools(role, flags)` projection (flag+role, name-deduped confirm); `executeVideoTool` (read guard, injected runner); `executeVideoPropose` (validate + persist, injected deps); `dispatchVideoConfirm` (injected deps, returns typed outcome incl. `cap_exceeded`); pure helpers `filterUsableAvProjects`, `resolveVideoProposeAction`, `VIDEO_CONFIRM_ACTIONS`. |
| `server/utils/ai/mcp/videoRunner.ts` *(create)* | BINDINGS: `buildVideoReadRunner()`, `buildVideoProposeDeps(ctx)`, `buildVideoConfirmDeps(ctx)` — wire the real engine fns (`listProjects`, `listSelectableVideoGenerationModels`, `getVideoGenerationJob`, `listVideoGenerationJobsForProject`, `getProjectWithCurrentTimeline`, `getVideoGenerationModel`, `evaluateVideoGenerationCompliance`, `estimateVideoGenerationCostCents`, `reserveAndCreateVideoGenerationJob`, `enqueueVideoGeneration`, `resolveSourceAssetUrls`, `createProject`, `emptyAvTimeline`, `proposeAction`) via `ctx.event`/`ctx.userId`. |
| `server/utils/ai/mcp/writeTools.ts` *(modify)* | Generalize `executeWriteConfirm`: optional `videoDispatch` + `writeEnabled` deps; add `cap_exceeded` to the outcome code union. Backward-compatible (defaults preserve 2c behaviour). |
| `server/api/internal/mcp/tools.post.ts` *(modify)* | Add `projectVideoTools(role, {suite,gen})` to the manifest; dedupe the assembled list by `name` (so `confirm_action` from either group appears once). |
| `server/api/internal/mcp/call.post.ts` *(modify)* | New branches: video reads → `executeVideoTool`; `propose_video_generation`/`create_video_project` → `executeVideoPropose`; confirm passes `videoDispatch` + `writeEnabled`; extend the rate-limit set to cover video propose/create. |
| `wrangler.toml` *(modify)* | Add the two commented-out dormant flags in `[vars]` with a doc comment. |
| `test/ai/mcpVideoTools.test.ts` *(create)* | All unit tests for the above. |

---

## Task 1: Video read tools — descriptors, projection, read guard (pure)

**Files:**
- Create: `server/utils/ai/mcp/videoTools.ts`
- Test: `test/ai/mcpVideoTools.test.ts`

**Interfaces:**
- Produces:
  - `interface VideoToolDescriptor { name: string; description: string; parameters: z.ZodTypeAny; requiredPermission: PermissionGroup }`
  - `videoReadTools: VideoToolDescriptor[]` (names: `list_av_projects`, `list_video_models`, `list_video_generations`, `get_video_generation_status`)
  - `type VideoFlags = { suite: boolean; gen: boolean }`
  - `projectVideoReadTools(role: string, suiteEnabled: boolean): McpToolManifest[]`
  - `type VideoExecuteOutcome = { ok:true, data:unknown } | { ok:false, error:string, code:'disabled'|'not_found'|'forbidden'|'bad_args'|'handler_error' }`
  - `type VideoReadRunner = Record<string, (args: unknown, ctx: ToolContext) => Promise<unknown>>`
  - `executeVideoTool(name, args, ctx, deps:{ enabled:boolean, runner:VideoReadRunner }): Promise<VideoExecuteOutcome>`
  - `filterUsableAvProjects(projects, actor): MediaProject[]`

- [ ] **Step 1: Write the failing tests**

```ts
// test/ai/mcpVideoTools.test.ts
import { describe, it, expect } from 'vitest'
import {
  videoReadTools, projectVideoReadTools, executeVideoTool, filterUsableAvProjects
} from '~~/server/utils/ai/mcp/videoTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = (role: string, userId = 'u1'): ToolContext => ({ userId, userRole: role, event: {} as any, source: 'mcp' })

describe('mcp video read projection', () => {
  it('returns no tools when the suite flag is off', () => {
    expect(projectVideoReadTools('admin', false)).toEqual([])
  })
  it('returns the 4 read tools for a CREATIVE role when the flag is on', () => {
    const names = projectVideoReadTools('admin', true).map(t => t.name)
    expect(names).toEqual(['list_av_projects', 'list_video_models', 'list_video_generations', 'get_video_generation_status'])
  })
  it('returns no tools for a role lacking CREATIVE', () => {
    // 'viewer' is a read-only role without CREATIVE — confirm via roleHasPermission in impl
    expect(projectVideoReadTools('viewer', true)).toEqual([])
  })
})

describe('filterUsableAvProjects', () => {
  const proj = (id: string, mediaType: string, createdBy: string) => ({ id, mediaType, createdBy } as any)
  it('keeps only av projects; admin/owner see all, others see own', () => {
    const all = [proj('a', 'av', 'u2'), proj('b', 'audio', 'u1'), proj('c', 'av', 'u1')]
    expect(filterUsableAvProjects(all, { id: 'u1', role: 'producer' }).map(p => p.id)).toEqual(['c'])
    expect(filterUsableAvProjects(all, { id: 'u1', role: 'admin' }).map(p => p.id)).toEqual(['a', 'c'])
  })
})

describe('executeVideoTool guard (never throws)', () => {
  const runner = { list_av_projects: async () => [{ id: 'a' }] }
  it('disabled when the flag is off', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('admin'), { enabled: false, runner })
    expect(r).toMatchObject({ ok: false, code: 'disabled' })
  })
  it('not_found for an unknown tool', async () => {
    const r = await executeVideoTool('nope', {}, ctx('admin'), { enabled: true, runner })
    expect(r).toMatchObject({ ok: false, code: 'not_found' })
  })
  it('forbidden for a role lacking CREATIVE', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('viewer'), { enabled: true, runner })
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
  })
  it('bad_args when args fail Zod', async () => {
    const r = await executeVideoTool('get_video_generation_status', { jobId: 'not-a-uuid' }, ctx('admin'), { enabled: true, runner })
    expect(r).toMatchObject({ ok: false, code: 'bad_args' })
  })
  it('handler_error when the runner throws', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('admin'), { enabled: true, runner: { list_av_projects: async () => { throw new Error('x') } } })
    expect(r).toMatchObject({ ok: false, code: 'handler_error' })
  })
  it('ok passes runner data through', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('admin'), { enabled: true, runner })
    expect(r).toEqual({ ok: true, data: [{ id: 'a' }] })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/ai/mcpVideoTools.test.ts`
Expected: FAIL — `Cannot find module '.../videoTools'`.

- [ ] **Step 3: Implement the read half of `videoTools.ts`**

```ts
import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { McpToolManifest } from './project'

export interface VideoToolDescriptor {
  name: string
  description: string
  parameters: z.ZodTypeAny
  requiredPermission: PermissionGroup
}

const UUID = z.string().uuid()

export const videoReadTools: VideoToolDescriptor[] = [
  {
    name: 'list_av_projects',
    description: 'List the AV (audio-visual) projects you can generate video into. Returns id/title/client/hasTimeline. Pick a projectId before starting a generation, or call create_video_project to make a new one.',
    parameters: z.object({}),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'list_video_models',
    description: 'List selectable video-generation models and, per model, the allowed modes / durations / aspect-ratios / resolutions / subject-types, plus the tenant monthly cap. Use this to form a valid propose_video_generation call. Optional projectId scopes to that tenant\'s policy.',
    parameters: z.object({ projectId: UUID.optional() }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'list_video_generations',
    description: 'List recent video-generation jobs for an AV project (status, mode, model, cost, createdAt).',
    parameters: z.object({ projectId: UUID }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'get_video_generation_status',
    description: 'Check a video-generation job by id. Returns status and, when ready, the output asset URL. Poll after confirming a propose_video_generation.',
    parameters: z.object({ jobId: UUID }),
    requiredPermission: 'CREATIVE'
  }
]

export function projectVideoReadTools(role: string, suiteEnabled: boolean): McpToolManifest[] {
  if (!suiteEnabled) return []
  return videoReadTools
    .filter(t => roleHasPermission(role, t.requiredPermission))
    .map(t => ({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown> }))
}

export function filterUsableAvProjects<T extends { mediaType: string, createdBy?: string | null }>(
  projects: T[], actor: { id: string, role: string }
): T[] {
  const all = actor.role === 'admin' || actor.role === 'owner'
  return projects.filter(p => p.mediaType === 'av' && (all || p.createdBy === actor.id))
}

export type VideoExecuteOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'not_found' | 'forbidden' | 'bad_args' | 'handler_error' }

export type VideoReadRunner = Record<string, (args: unknown, ctx: ToolContext) => Promise<unknown>>

export async function executeVideoTool(
  name: string, args: unknown, ctx: ToolContext, deps: { enabled: boolean, runner: VideoReadRunner }
): Promise<VideoExecuteOutcome> {
  if (!deps.enabled) return { ok: false, error: 'Video tools are not enabled over MCP.', code: 'disabled' }
  const tool = videoReadTools.find(t => t.name === name)
  if (!tool) return { ok: false, error: `Unknown video tool: ${name}`, code: 'not_found' }
  if (!roleHasPermission(ctx.userRole, tool.requiredPermission)) return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  const parsed = tool.parameters.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
  const run = deps.runner[name]
  if (!run) return { ok: false, error: 'No runner registered for tool.', code: 'handler_error' }
  try {
    return { ok: true, data: await run(parsed.data, ctx) }
  } catch {
    return { ok: false, error: 'Video tool failed.', code: 'handler_error' }
  }
}
```

> If `projectVideoReadTools('viewer', true)` does NOT return `[]` (i.e. `viewer` happens to hold CREATIVE), pick a genuinely non-CREATIVE role for the test by checking `server/utils/permissions.ts`; the assertion is "a role without CREATIVE yields no tools."

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/ai/mcpVideoTools.test.ts`
Expected: PASS (all read-projection + guard + filter tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/mcp/videoTools.ts test/ai/mcpVideoTools.test.ts
git commit -m "feat(ai): MCP 2b video read tools — descriptors, projection, guard (pure)"
```

---

## Task 2: Video read runner + wire reads into the internal endpoints

**Files:**
- Create: `server/utils/ai/mcp/videoRunner.ts`
- Modify: `server/api/internal/mcp/call.post.ts`, `server/api/internal/mcp/tools.post.ts`
- Test: `test/ai/mcpVideoTools.test.ts` (add a runner-scoping test with injected db/engine stubs)

**Interfaces:**
- Consumes: `VideoReadRunner` (Task 1), engine fns (`listProjects`, `listSelectableVideoGenerationModels`, `selectableVideoModelOptions`, `loadTenantVideoGenerationPolicy`, `getProjectWithCurrentTimeline`, `getVideoGenerationJob`, `listVideoGenerationJobsForProject`), `canUseVideoGenerationProject`, `filterUsableAvProjects`.
- Produces: `buildVideoReadRunner(): VideoReadRunner`.

- [ ] **Step 1: Implement `buildVideoReadRunner` in `videoRunner.ts`**

```ts
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { VideoReadRunner } from './videoTools'
import { filterUsableAvProjects } from './videoTools'
import { listProjects, getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import {
  listSelectableVideoGenerationModels, getVideoGenerationModel
} from '~~/server/utils/video-generation/modelRegistry'
import { selectableVideoModelOptions } from '~~/app/utils/video/modelPresentation'
import { loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { getVideoGenerationJob, listVideoGenerationJobsForProject } from '~~/server/utils/video-generation/jobs'

interface ModelsArgs { projectId?: string }
interface ListArgs { projectId: string }
interface StatusArgs { jobId: string }

// Resolve + authorize a projectId for the actor; returns the project+timeline or null (caller → not_found/forbidden).
async function authorizedProject(projectId: string, ctx: ToolContext) {
  const existing = await getProjectWithCurrentTimeline(projectId)
  if (!existing || existing.project.mediaType !== 'av') return null
  if (!canUseVideoGenerationProject({ id: ctx.userId, role: ctx.userRole }, existing.project)) return null
  return existing
}

export function buildVideoReadRunner(): VideoReadRunner {
  return {
    list_av_projects: async (_raw, ctx) => {
      const all = await listProjects()
      return filterUsableAvProjects(all, { id: ctx.userId, role: ctx.userRole })
        .map(p => ({ id: p.id, title: p.title, clientId: p.clientId ?? null, hasTimeline: !!p.currentTimelineId }))
    },
    list_video_models: async (raw, ctx) => {
      const a = raw as ModelsArgs
      const models = selectableVideoModelOptions(listSelectableVideoGenerationModels())
      if (!a.projectId) return { models, policy: { enabled: true } }
      const existing = await authorizedProject(a.projectId, ctx)
      if (!existing) throw new Error('project not usable')
      const policy = await loadTenantVideoGenerationPolicy(existing.project.clientId ?? 'agency')
      return { models: policy.enabled ? models : [], policy: { enabled: policy.enabled, monthlyCapCents: policy.monthlyCapCents } }
    },
    list_video_generations: async (raw, ctx) => {
      const a = raw as ListArgs
      const existing = await authorizedProject(a.projectId, ctx)
      if (!existing) throw new Error('project not usable')
      const jobs = await listVideoGenerationJobsForProject(a.projectId, 50)
      return jobs.map(j => ({ jobId: j.id, status: j.status, mode: j.mode, modelId: j.modelId, estimatedCostCents: j.estimatedCostCents, actualCostCents: j.actualCostCents, createdAt: j.createdAt }))
    },
    get_video_generation_status: async (raw, ctx) => {
      const a = raw as StatusArgs
      const job = await getVideoGenerationJob(a.jobId)
      if (!job) return { status: 'not_found' }
      const existing = await authorizedProject(job.projectId, ctx)
      if (!existing) throw new Error('job not usable')
      return {
        jobId: job.id, status: job.status, providerStatus: job.providerStatus,
        outputAssetId: job.outputAssetId, assetUrl: job.providerResultUrl ?? null,
        estimatedCostCents: job.estimatedCostCents, actualCostCents: job.actualCostCents,
        error: job.errorMessage ?? null
      }
    }
  }
}
```

> Note: `getVideoGenerationModel` is imported for Task 3 reuse; if unused here, omit it from this file's imports and add in Task 3.

- [ ] **Step 2: Wire reads into `call.post.ts`**

Add imports at the top:
```ts
import { videoReadTools, executeVideoTool } from '~~/server/utils/ai/mcp/videoTools'
import { buildVideoReadRunner } from '~~/server/utils/ai/mcp/videoRunner'
```
Add the flag near `writeEnabled`:
```ts
const videoSuiteEnabled = process.env.MCP_VIDEO_TOOLS_ENABLED === 'true'
```
Add the routing branch BEFORE the final `else` (the read-only fallback), alongside `isGeneration`:
```ts
const isVideoRead = videoReadTools.some(t => t.name === toolName)
```
…and in the if/else chain, before `else { executeReadOnlyTool … }`:
```ts
} else if (isVideoRead) {
  outcome = await executeVideoTool(toolName, args, ctx, { enabled: videoSuiteEnabled, runner: buildVideoReadRunner() })
}
```

- [ ] **Step 3: Wire reads into `tools.post.ts` (manifest) with name-dedup**

Add import:
```ts
import { projectVideoReadTools } from '~~/server/utils/ai/mcp/videoTools'
```
Replace the `return { tools: [ … ] }` with a deduped assembly:
```ts
const assembled = [
  ...projectReadOnlyTools(registry as AiTool<unknown>[], role),
  ...projectGenerationTools(role, process.env.MCP_GEN_TOOLS_ENABLED === 'true'),
  ...projectWriteTools(registry as AiTool<unknown>[], role, process.env.MCP_WRITE_TOOLS_ENABLED === 'true'),
  ...projectVideoReadTools(role, process.env.MCP_VIDEO_TOOLS_ENABLED === 'true')
]
const seen = new Set<string>()
const tools = assembled.filter(t => (seen.has(t.name) ? false : (seen.add(t.name), true)))
return { tools }
```
*(Task 6 adds the propose/confirm video manifests into this same assembly; dedup already handles the shared `confirm_action`.)*

- [ ] **Step 4: Add a runner-scoping test**

```ts
// in test/ai/mcpVideoTools.test.ts — uses the guard with a stub runner to prove scoping shape
import { buildVideoReadRunner } from '~~/server/utils/ai/mcp/videoRunner'
// (Integration against real DB is covered by operator live-verify; here assert the runner map has the 4 keys.)
describe('video read runner', () => {
  it('registers a runner for each read tool', () => {
    const r = buildVideoReadRunner()
    expect(Object.keys(r).sort()).toEqual(['get_video_generation_status', 'list_av_projects', 'list_video_generations', 'list_video_models'])
  })
})
```

- [ ] **Step 5: Run + commit**

Run: `npx vitest run test/ai/mcpVideoTools.test.ts` → PASS
```bash
git add server/utils/ai/mcp/videoRunner.ts server/api/internal/mcp/call.post.ts server/api/internal/mcp/tools.post.ts test/ai/mcpVideoTools.test.ts
git commit -m "feat(ai): MCP 2b video read runner + wire reads into internal endpoints"
```

---

## Task 3: `propose_video_generation` — validate + persist (no spend)

**Files:**
- Modify: `server/utils/ai/mcp/videoTools.ts` (add propose descriptors + `executeVideoPropose` + `resolveVideoProposeAction` + `VIDEO_CONFIRM_ACTIONS`)
- Test: `test/ai/mcpVideoTools.test.ts`

**Interfaces:**
- Produces:
  - `VIDEO_CONFIRM_ACTIONS = ['video_generation','video_project_create'] as const`
  - `videoProposeTools: VideoToolDescriptor[]` (names: `propose_video_generation`, `create_video_project`)
  - `resolveVideoProposeAction(name): 'video_generation'|'video_project_create'|null`
  - `type VideoProposeOutcome = { ok:true, data:unknown } | { ok:false, error:string, code:'disabled'|'forbidden'|'bad_args'|'blocked'|'handler_error' }`
  - `interface VideoProposeDeps { suiteEnabled:boolean; genEnabled:boolean; resolveProject; getModel; assertModelSupports; loadSources; loadPolicy; evaluateCompliance; estimateCost; persist }` (each injected — see signatures inline)
  - `executeVideoPropose(action, args, ctx, deps): Promise<VideoProposeOutcome>`

- [ ] **Step 1: Write the failing tests**

```ts
import { executeVideoPropose, resolveVideoProposeAction } from '~~/server/utils/ai/mcp/videoTools'

const genArgs = {
  projectId: '11111111-1111-1111-1111-111111111111', mode: 'text-to-video', modelId: 'm1',
  prompt: 'a calm city street at dawn', durationSeconds: 5, aspectRatio: '16:9', subjectType: 'unknown'
}
const baseDeps = () => ({
  suiteEnabled: true, genEnabled: true,
  resolveProject: async () => ({ project: { mediaType: 'av', clientId: 'c1', createdBy: 'u1', currentTimelineId: 't1' }, timeline: { id: 't1' } }),
  getModel: () => ({ id: 'm1', provider: 'cf', modes: ['text-to-video'], durationsSeconds: [5], aspectRatios: ['16:9'], resolutions: [], allowedSubjectTypes: ['unknown'], requiresApprovedSourceAsset: false }),
  isTenantModel: () => true,
  loadSources: async () => [],
  loadPolicy: async () => ({ enabled: true, monthlyCapCents: 100000 }),
  evaluateCompliance: () => ({ allowed: true, classification: 'clear', reasons: [] as string[] }),
  estimateCost: () => 250,
  persist: async () => 'prop-123'
})

describe('resolveVideoProposeAction', () => {
  it('maps the two propose tools, null otherwise', () => {
    expect(resolveVideoProposeAction('propose_video_generation')).toBe('video_generation')
    expect(resolveVideoProposeAction('create_video_project')).toBe('video_project_create')
    expect(resolveVideoProposeAction('create_task')).toBeNull()
  })
})

describe('executeVideoPropose — video_generation', () => {
  const ctx = (role = 'admin') => ({ userId: 'u1', userRole: role, event: {} as any, source: 'mcp' })
  it('disabled when the gen flag is off', async () => {
    const r = await executeVideoPropose('video_generation', genArgs, ctx() as any, { ...baseDeps(), genEnabled: false })
    expect(r).toMatchObject({ ok: false, code: 'disabled' })
  })
  it('forbidden for a non-CREATIVE role', async () => {
    const r = await executeVideoPropose('video_generation', genArgs, ctx('viewer') as any, baseDeps())
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
  })
  it('forbidden when the project is not AV / not owned', async () => {
    const r = await executeVideoPropose('video_generation', genArgs, ctx() as any, { ...baseDeps(), resolveProject: async () => null })
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
  })
  it('bad_args when the model rejects the params', async () => {
    const r = await executeVideoPropose('video_generation', { ...genArgs, durationSeconds: 999 }, ctx() as any, baseDeps())
    expect(r).toMatchObject({ ok: false, code: 'bad_args' })
  })
  it('blocked (no proposal persisted) when compliance disallows', async () => {
    const persist = vi.fn()
    const r = await executeVideoPropose('video_generation', genArgs, ctx() as any, { ...baseDeps(), evaluateCompliance: () => ({ allowed: false, classification: 'prohibited', reasons: ['x'] }), persist })
    expect(r).toMatchObject({ ok: false, code: 'blocked' })
    expect(persist).not.toHaveBeenCalled()
  })
  it('happy path persists and previews cost + classification', async () => {
    const r = await executeVideoPropose('video_generation', genArgs, ctx() as any, baseDeps())
    expect(r).toEqual({ ok: true, data: expect.objectContaining({ proposalId: 'prop-123', estimatedCostCents: 250, complianceClassification: 'clear' }) })
  })
})
```
*(Add `import { vi } from 'vitest'` to the test file.)*

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/ai/mcpVideoTools.test.ts -t 'executeVideoPropose'`
Expected: FAIL — `executeVideoPropose is not a function`.

- [ ] **Step 3: Implement propose descriptors + `executeVideoPropose`**

Append to `videoTools.ts`:
```ts
export const VIDEO_CONFIRM_ACTIONS = ['video_generation', 'video_project_create'] as const
export type VideoConfirmAction = typeof VIDEO_CONFIRM_ACTIONS[number]

const VideoGenParams = z.object({
  projectId: UUID,
  mode: z.enum(['text-to-video', 'image-to-video', 'video-extension', 'lip-sync']),
  modelId: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  sourceAssetIds: z.array(z.string()).default([]),
  durationSeconds: z.number().int().positive().max(60),
  aspectRatio: z.string().min(1),
  resolution: z.string().nullable().optional(),
  subjectType: z.enum(['vehicle', 'non_vehicle', 'unknown']).default('unknown')
})
const VideoProjectParams = z.object({ title: z.string().min(1).max(200), clientId: UUID.nullable().optional() })

export const videoProposeTools: VideoToolDescriptor[] = [
  {
    name: 'propose_video_generation',
    description: 'Propose (does NOT spend yet) a video generation into an AV project. Returns a proposalId with the estimated cost + compliance classification + resolved model/params. Call confirm_action(proposalId) to reserve budget and start it. Modes: text-to-video needs no source; image-to-video / video-extension / lip-sync need source asset ids registered in-app.',
    parameters: VideoGenParams,
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'create_video_project',
    description: 'Propose creating a new empty AV project to generate video into. Returns a proposalId; call confirm_action(proposalId) to create it. Use when no suitable project exists (see list_av_projects).',
    parameters: VideoProjectParams,
    requiredPermission: 'CREATIVE'
  }
]

export function resolveVideoProposeAction(name: string): VideoConfirmAction | null {
  if (name === 'propose_video_generation') return 'video_generation'
  if (name === 'create_video_project') return 'video_project_create'
  return null
}

export type VideoProposeOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'forbidden' | 'bad_args' | 'blocked' | 'handler_error' }

export interface VideoProposeDeps {
  suiteEnabled: boolean
  genEnabled: boolean
  resolveProject: (projectId: string, ctx: ToolContext) => Promise<{ project: any, timeline: any } | null>
  getModel: (modelId: string) => any | null
  isTenantModel: (model: any) => boolean
  loadSources: (ids: string[], tenantId: string | undefined, mode: string) => Promise<any[]>
  loadPolicy: (tenantId: string) => Promise<any>
  evaluateCompliance: (input: any) => { allowed: boolean, classification: string, reasons: string[] }
  estimateCost: (model: any, durationSeconds: number) => number
  // Persist an ai_pending_actions row (tool_name = action) and return its id.
  persist: (ctx: ToolContext, action: VideoConfirmAction, payload: unknown) => Promise<string>
}

function modelSupports(model: any, p: z.infer<typeof VideoGenParams>): boolean {
  if (!model.modes.includes(p.mode)) return false
  if (!model.durationsSeconds.includes(p.durationSeconds)) return false
  if (!model.aspectRatios.includes(p.aspectRatio)) return false
  if (p.resolution && !model.resolutions.includes(p.resolution)) return false
  if (p.subjectType !== 'unknown' && !model.allowedSubjectTypes.includes(p.subjectType)) return false
  if (model.requiresApprovedSourceAsset && p.sourceAssetIds.length === 0) return false
  return true
}

export async function executeVideoPropose(
  action: VideoConfirmAction, args: unknown, ctx: ToolContext, deps: VideoProposeDeps
): Promise<VideoProposeOutcome> {
  if (!deps.suiteEnabled || !deps.genEnabled) return { ok: false, error: 'Video generation is not enabled over MCP.', code: 'disabled' }
  if (!roleHasPermission(ctx.userRole, 'CREATIVE')) return { ok: false, error: 'Not permitted.', code: 'forbidden' }

  if (action === 'video_project_create') {
    const parsed = VideoProjectParams.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
    try {
      const proposalId = await deps.persist(ctx, 'video_project_create', { title: parsed.data.title, clientId: parsed.data.clientId ?? null })
      return { ok: true, data: { proposalId, kind: 'video_project_create', title: parsed.data.title } }
    } catch { return { ok: false, error: 'Propose failed.', code: 'handler_error' } }
  }

  // video_generation
  const parsed = VideoGenParams.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
  const p = parsed.data
  try {
    const existing = await deps.resolveProject(p.projectId, ctx)
    if (!existing) return { ok: false, error: 'Project not found or not an AV project you can use.', code: 'forbidden' }
    const model = deps.getModel(p.modelId)
    if (!model || !deps.isTenantModel(model)) return { ok: false, error: 'Unknown or unavailable model.', code: 'bad_args' }
    if (!modelSupports(model, p)) return { ok: false, error: 'Model does not support the requested mode/params.', code: 'bad_args' }

    const tenantId = existing.project.clientId ?? 'agency'
    let sources: any[] = []
    try { sources = await deps.loadSources(p.sourceAssetIds, p.mode === 'image-to-video' ? tenantId : undefined, p.mode) }
    catch { return { ok: false, error: 'Source image unavailable.', code: 'bad_args' } }
    const policy = await deps.loadPolicy(tenantId)

    const compliance = deps.evaluateCompliance({
      mode: p.mode, prompt: p.prompt, model, sourceAssets: sources, requestedSubjectType: p.subjectType,
      tenantPolicy: policy, provenance: { userId: ctx.userId, tenantId, projectId: p.projectId }
    })
    if (!compliance.allowed) return { ok: false, error: `Blocked: ${compliance.reasons.join('; ') || 'compliance'}`, code: 'blocked' }

    const estimatedCostCents = deps.estimateCost(model, p.durationSeconds)
    const payload = {
      tenantId, projectId: p.projectId,
      timelineId: existing.timeline?.id ?? existing.project.currentTimelineId ?? null,
      mode: p.mode, modelId: model.id, provider: model.provider, prompt: p.prompt,
      sourceAssetIds: p.sourceAssetIds, durationSeconds: p.durationSeconds, aspectRatio: p.aspectRatio,
      resolution: p.resolution ?? null, subjectType: p.subjectType,
      complianceStatus: compliance.classification, complianceReasons: compliance.reasons, estimatedCostCents
    }
    const proposalId = await deps.persist(ctx, 'video_generation', payload)
    return { ok: true, data: { proposalId, kind: 'video_generation', estimatedCostCents, complianceClassification: compliance.classification, resolvedModel: model.id, resolvedParams: { mode: p.mode, durationSeconds: p.durationSeconds, aspectRatio: p.aspectRatio } } }
  } catch { return { ok: false, error: 'Propose failed.', code: 'handler_error' } }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/ai/mcpVideoTools.test.ts -t 'executeVideoPropose'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/mcp/videoTools.ts test/ai/mcpVideoTools.test.ts
git commit -m "feat(ai): MCP 2b propose_video_generation — validate + cost/compliance preview (no spend)"
```

---

## Task 4: `dispatchVideoConfirm` — execute the confirmed action (reserve+enqueue / create project)

**Files:**
- Modify: `server/utils/ai/mcp/videoTools.ts`
- Test: `test/ai/mcpVideoTools.test.ts`

**Interfaces:**
- Consumes: `VIDEO_CONFIRM_ACTIONS`.
- Produces:
  - `interface ClaimedRow { tool_name: string; resolved_payload: unknown }`
  - `type VideoConfirmOutcome = { ok:true, data:unknown } | { ok:false, error:string, code:'forbidden'|'cap_exceeded'|'handler_error' }`
  - `interface VideoConfirmDeps { genEnabled:boolean; reserve:(payload:any, ctx:ToolContext)=>Promise<{ ok:boolean, reason?:string, remainingCents?:number, job?:any, reused?:boolean }>; enqueue:(payload:any, jobId:string, ctx:ToolContext)=>Promise<void>; createProject:(payload:any, ctx:ToolContext)=>Promise<{ projectId:string }> }`
  - `dispatchVideoConfirm(row: ClaimedRow, ctx, deps): Promise<VideoConfirmOutcome | null>` — returns `null` when `row.tool_name` is not a video action (caller falls through to the 2c path).

- [ ] **Step 1: Write failing tests**

```ts
import { dispatchVideoConfirm } from '~~/server/utils/ai/mcp/videoTools'
const cctx = () => ({ userId: 'u1', userRole: 'admin', event: {} as any, source: 'mcp' })
const genPayload = { tenantId: 'c1', projectId: 'p1', mode: 'text-to-video', modelId: 'm1', provider: 'cf', prompt: 'x', sourceAssetIds: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null, subjectType: 'unknown', complianceStatus: 'clear', complianceReasons: [], estimatedCostCents: 250, timelineId: 't1' }

describe('dispatchVideoConfirm', () => {
  const okDeps = () => ({
    genEnabled: true,
    reserve: async () => ({ ok: true, reused: false, job: { id: 'job-1' } }),
    enqueue: vi.fn(async () => {}),
    createProject: async () => ({ projectId: 'newproj' })
  })
  it('returns null for a non-video tool_name (2c falls through)', async () => {
    expect(await dispatchVideoConfirm({ tool_name: 'create_task', resolved_payload: {} }, cctx() as any, okDeps())).toBeNull()
  })
  it('forbidden when gen flag is off', async () => {
    const r = await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: genPayload }, cctx() as any, { ...okDeps(), genEnabled: false })
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
  })
  it('video_generation happy path reserves + enqueues once, returns jobId', async () => {
    const deps = okDeps()
    const r = await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: genPayload }, cctx() as any, deps)
    expect(r).toEqual({ ok: true, data: { jobId: 'job-1', status: 'queued' } })
    expect(deps.enqueue).toHaveBeenCalledTimes(1)
  })
  it('cap_exceeded when reservation fails — no enqueue', async () => {
    const deps = { ...okDeps(), reserve: async () => ({ ok: false, reason: 'cap_exceeded', remainingCents: 100 }) }
    const r = await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: genPayload }, cctx() as any, deps)
    expect(r).toMatchObject({ ok: false, code: 'cap_exceeded' })
    expect(deps.enqueue).not.toHaveBeenCalled()
  })
  it('reused reservation does not re-enqueue', async () => {
    const deps = { ...okDeps(), reserve: async () => ({ ok: true, reused: true, job: { id: 'job-1' } }) }
    const r = await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: genPayload }, cctx() as any, deps)
    expect(r).toEqual({ ok: true, data: { jobId: 'job-1', status: 'queued' } })
    expect(deps.enqueue).not.toHaveBeenCalled()
  })
  it('video_project_create returns the new projectId', async () => {
    const r = await dispatchVideoConfirm({ tool_name: 'video_project_create', resolved_payload: { title: 'New', clientId: null } }, cctx() as any, okDeps())
    expect(r).toEqual({ ok: true, data: { projectId: 'newproj' } })
  })
})
```

- [ ] **Step 2: Run → FAIL** (`dispatchVideoConfirm is not a function`).

- [ ] **Step 3: Implement `dispatchVideoConfirm`**

Append to `videoTools.ts`:
```ts
export interface ClaimedRow { tool_name: string, resolved_payload: unknown }
export type VideoConfirmOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'forbidden' | 'cap_exceeded' | 'handler_error' }

export interface VideoConfirmDeps {
  genEnabled: boolean
  reserve: (payload: any, ctx: ToolContext) => Promise<{ ok: boolean, reason?: string, remainingCents?: number, job?: any, reused?: boolean }>
  enqueue: (payload: any, jobId: string, ctx: ToolContext) => Promise<void>
  createProject: (payload: any, ctx: ToolContext) => Promise<{ projectId: string }>
}

export async function dispatchVideoConfirm(
  row: ClaimedRow, ctx: ToolContext, deps: VideoConfirmDeps
): Promise<VideoConfirmOutcome | null> {
  if (!(VIDEO_CONFIRM_ACTIONS as readonly string[]).includes(row.tool_name)) return null
  if (!deps.genEnabled) return { ok: false, error: 'Video generation is not enabled over MCP.', code: 'forbidden' }
  try {
    if (row.tool_name === 'video_project_create') {
      const { projectId } = await deps.createProject(row.resolved_payload, ctx)
      return { ok: true, data: { projectId } }
    }
    // video_generation
    const reservation = await deps.reserve(row.resolved_payload, ctx)
    if (!reservation.ok || !reservation.job) {
      return { ok: false, error: `Budget unavailable (${reservation.reason ?? 'cap'}).`, code: 'cap_exceeded' }
    }
    if (!reservation.reused) await deps.enqueue(row.resolved_payload, reservation.job.id, ctx)
    return { ok: true, data: { jobId: reservation.job.id, status: 'queued' } }
  } catch {
    return { ok: false, error: 'Execution failed.', code: 'handler_error' }
  }
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/mcp/videoTools.ts test/ai/mcpVideoTools.test.ts
git commit -m "feat(ai): MCP 2b dispatchVideoConfirm — reserve+enqueue / create project, cap_exceeded"
```

---

## Task 5: Propose + confirm runner deps (bindings) in `videoRunner.ts`

**Files:**
- Modify: `server/utils/ai/mcp/videoRunner.ts`
- Test: none new (binding wiring; covered by Task 3/4 pure tests + operator live-verify).

**Interfaces:**
- Produces:
  - `buildVideoProposeDeps(): Pick<VideoProposeDeps,'resolveProject'|'getModel'|'isTenantModel'|'loadSources'|'loadPolicy'|'evaluateCompliance'|'estimateCost'|'persist'>` (flags supplied by the endpoint).
  - `buildVideoConfirmDeps(): Pick<VideoConfirmDeps,'reserve'|'enqueue'|'createProject'>` (genEnabled supplied by the endpoint).

- [ ] **Step 1: Implement the binding deps**

Append to `videoRunner.ts` (add imports for `getVideoGenerationModel`, `isTenantModel`, `loadVideoGenerationSourceAssets`, `evaluateVideoGenerationCompliance`, `estimateVideoGenerationCostCents`, `reserveAndCreateVideoGenerationJob`, `enqueueVideoGeneration`, `createProject`, `emptyAvTimeline`, `proposeAction`):
```ts
import { isTenantModel } from '~~/server/utils/video-generation/surface'
import { loadVideoGenerationSourceAssets } from '~~/server/utils/video-generation/sourceAssets'
import { evaluateVideoGenerationCompliance } from '~~/server/utils/video-generation/compliance'
import { estimateVideoGenerationCostCents } from '~~/server/utils/video-generation/costs'
import { reserveAndCreateVideoGenerationJob } from '~~/server/utils/video-generation/budget'
import { enqueueVideoGeneration } from '~~/server/utils/video-generation/enqueue'
import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'
import { createProject } from '~~/server/utils/audio/projects'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { proposeAction } from '~~/server/utils/ai/pendingActions'
import { randomUUID } from 'node:crypto'

export function buildVideoProposeDeps() {
  return {
    resolveProject: authorizedProject, // already defined in this file (Task 2)
    getModel: getVideoGenerationModel,
    isTenantModel,
    loadSources: (ids: string[], tenantId: string | undefined) => loadVideoGenerationSourceAssets(ids, tenantId),
    loadPolicy: (tenantId: string) => loadTenantVideoGenerationPolicy(tenantId),
    evaluateCompliance: (input: any) => evaluateVideoGenerationCompliance(input),
    estimateCost: (model: any, secs: number) => estimateVideoGenerationCostCents(model, secs),
    persist: (ctx: ToolContext, action: 'video_generation' | 'video_project_create', payload: unknown) =>
      proposeAction(ctx, null, action, payload)
  }
}

export function buildVideoConfirmDeps() {
  return {
    // Reserve budget + insert the job row; derive a deterministic idempotencyKey from the pending id is
    // unavailable here, so use the proposal payload's projectId + a per-confirm uuid is WRONG (would
    // double-bill on retry). Instead the confirm endpoint passes the proposalId; we key on it.
    reserve: async (payload: any, ctx: ToolContext) => reserveAndCreateVideoGenerationJob({
      tenantId: payload.tenantId, projectId: payload.projectId, timelineId: payload.timelineId,
      createdBy: ctx.userId, status: 'queued', mode: payload.mode, modelId: payload.modelId,
      provider: payload.provider, prompt: payload.prompt, sourceAssetIds: payload.sourceAssetIds,
      durationSeconds: payload.durationSeconds, aspectRatio: payload.aspectRatio, resolution: payload.resolution,
      subjectType: payload.subjectType, complianceStatus: payload.complianceStatus,
      complianceReasons: payload.complianceReasons, estimatedCostCents: payload.estimatedCostCents,
      idempotencyKey: payload.idempotencyKey
    }, await loadTenantVideoGenerationPolicy(payload.tenantId)),
    enqueue: async (payload: any, jobId: string, ctx: ToolContext) => {
      let sourceAssetUrls: string[] = []
      if (payload.mode === 'image-to-video') sourceAssetUrls = await resolveSourceAssetUrls(payload.sourceAssetIds, payload.tenantId)
      await enqueueVideoGeneration(ctx.event, { jobId, tenantId: payload.tenantId, idempotencyKey: payload.idempotencyKey, sourceAssetUrls })
    },
    createProject: async (payload: any, ctx: ToolContext) => {
      const { project } = await createProject({ createdBy: ctx.userId, clientId: payload.clientId ?? null, title: payload.title, mediaType: 'av', initialState: emptyAvTimeline() })
      return { projectId: project.id }
    }
  }
}
```

> **idempotencyKey:** the pending payload must carry one so a double-confirm cannot double-bill. The confirm endpoint (Task 6) injects it: when claiming the row it derives `idempotencyKey = 'mcp:' + proposalId` and merges it into `resolved_payload` before calling `dispatchVideoConfirm`. (The 2c atomic single-use claim already guarantees one execution; this is belt-and-braces against engine-level retries.) Export `authorizedProject` from Task 2 so `buildVideoProposeDeps` can reference it.

- [ ] **Step 2: Make `authorizedProject` exported** (change `async function authorizedProject` → `export async function authorizedProject` in `videoRunner.ts`).

- [ ] **Step 3: Typecheck the new file** (no new unit test — wiring only):

Run: `npx vitest run test/ai/mcpVideoTools.test.ts`
Expected: PASS (unchanged — this task adds binding glue the endpoint will use).

- [ ] **Step 4: Commit**

```bash
git add server/utils/ai/mcp/videoRunner.ts
git commit -m "feat(ai): MCP 2b propose/confirm binding deps (engine wiring)"
```

---

## Task 6: Generalize the shared confirm + wire propose/confirm into `/call`, manifest, flags, rate-limit

**Files:**
- Modify: `server/utils/ai/mcp/writeTools.ts` (generalize `executeWriteConfirm`)
- Modify: `server/api/internal/mcp/call.post.ts` (propose + confirm branches, flags, rate-limit)
- Modify: `server/api/internal/mcp/tools.post.ts` (add propose/confirm manifests — already deduped in Task 2)
- Modify: `server/utils/ai/mcp/videoTools.ts` (add `projectVideoTools(role, flags)` full projection)
- Test: `test/ai/mcpVideoTools.test.ts` (flag-matrix projection) + keep `test/ai/mcpWriteTools.test.ts` green

**Interfaces:**
- Produces: `projectVideoTools(role, flags: VideoFlags): McpToolManifest[]` (reads when `suite`; propose `propose_video_generation`+`create_video_project` and `confirm_action` when `suite && gen`).
- Modifies: `executeWriteConfirm` deps gain optional `writeEnabled?: boolean` (default `deps.enabled`) and `videoDispatch?: (row: ClaimedProposal, ctx) => Promise<WriteConfirmOutcome | null>`; outcome code union gains `'cap_exceeded'`.

- [ ] **Step 1: Write the failing projection + generalized-confirm tests**

Add to `test/ai/mcpVideoTools.test.ts`:
```ts
import { projectVideoTools } from '~~/server/utils/ai/mcp/videoTools'
describe('projectVideoTools flag matrix', () => {
  it('suite off → no tools', () => { expect(projectVideoTools('admin', { suite: false, gen: false })).toEqual([]) })
  it('suite on / gen off → reads only (browse-only)', () => {
    expect(projectVideoTools('admin', { suite: true, gen: false }).map(t => t.name))
      .toEqual(['list_av_projects', 'list_video_models', 'list_video_generations', 'get_video_generation_status'])
  })
  it('suite + gen on → reads + propose + create + confirm_action', () => {
    expect(projectVideoTools('admin', { suite: true, gen: true }).map(t => t.name)).toEqual(
      ['list_av_projects', 'list_video_models', 'list_video_generations', 'get_video_generation_status',
       'propose_video_generation', 'create_video_project', 'confirm_action'])
  })
  it('non-CREATIVE role → no tools even with flags on', () => {
    expect(projectVideoTools('viewer', { suite: true, gen: true })).toEqual([])
  })
})
```
Add to `test/ai/mcpWriteTools.test.ts` (generalized confirm — video dispatch + write gating):
```ts
it('routes a video tool_name through videoDispatch', async () => {
  const r = await executeWriteConfirm({ proposalId: 'p'.repeat(10) }, ctx, {
    enabled: true, writeEnabled: false,
    claim: async () => ({ tool_name: 'video_generation', resolved_payload: {} }),
    getExecutor: () => null,
    videoDispatch: async () => ({ ok: true, data: { jobId: 'j1' } })
  } as any)
  expect(r).toEqual({ ok: true, data: { jobId: 'j1' } })
})
it('a 2c safe action is forbidden when writeEnabled is off (video-only mode)', async () => {
  const r = await executeWriteConfirm({ proposalId: 'p'.repeat(10) }, ctx, {
    enabled: true, writeEnabled: false,
    claim: async () => ({ tool_name: 'create_task', resolved_payload: {} }),
    getExecutor: () => ({ toolName: 'create_task', label: 't', riskTier: 'confirm', execute: async () => ({ resultRef: 'x', summary: 'y' }) }),
    videoDispatch: async () => null
  } as any)
  expect(r).toMatchObject({ ok: false, code: 'forbidden' })
})
```
*(Reuse the existing `ctx` helper in mcpWriteTools.test.ts.)*

- [ ] **Step 2: Run → FAIL** (`projectVideoTools` missing; `executeWriteConfirm` ignores `videoDispatch`).

- [ ] **Step 3a: Generalize `executeWriteConfirm` in `writeTools.ts`**

Extend the outcome union and deps, and insert the video dispatch + write gating after the claim:
```ts
export type WriteConfirmOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'bad_args' | 'expired' | 'forbidden' | 'not_found' | 'confirm_required' | 'handler_error' | 'cap_exceeded' }

export interface ConfirmDeps {
  enabled: boolean
  /** Gates the 2c safe-action dispatch specifically. Defaults to `enabled` (preserves prior behaviour). */
  writeEnabled?: boolean
  claim: (proposalId: string, userId: string) => Promise<ClaimedProposal | null>
  getExecutor: (toolName: string) => ActionExecutor | null
  /** Optional: handle video confirm-tier tool_names; return null to fall through to the 2c path. */
  videoDispatch?: (row: ClaimedProposal, ctx: ToolContext) => Promise<WriteConfirmOutcome | null>
}
```
Inside `executeWriteConfirm`, right after `const row = await deps.claim(...)` / null-check:
```ts
  // Video confirm-tier actions get their own dispatch (returns cap_exceeded / jobId / projectId).
  if (deps.videoDispatch) {
    const vo = await deps.videoDispatch(row, ctx)
    if (vo) return vo
  }
  // 2c safe-action path is gated by the WRITE group specifically.
  const writeEnabled = deps.writeEnabled ?? deps.enabled
  if (!writeEnabled) return { ok: false, error: 'This action is not available over MCP.', code: 'forbidden' }
```
*(Leave the rest — `isSafeAction`, `getExecutor`, ack/permission re-check — unchanged.)*

- [ ] **Step 3b: Add `projectVideoTools` to `videoTools.ts`**

```ts
import { MCP_CONFIRM_TOOL } from './writeTools'

export type VideoFlags = { suite: boolean, gen: boolean }

export function projectVideoTools(role: string, flags: VideoFlags): McpToolManifest[] {
  if (!flags.suite) return []
  if (!roleHasPermission(role, 'CREATIVE')) return []
  const reads = projectVideoReadTools(role, true)
  if (!flags.gen) return reads
  const proposes = videoProposeTools.map(t => ({
    name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>
  }))
  const confirm = {
    name: MCP_CONFIRM_TOOL,
    description: 'Execute a previously proposed action by its proposalId (e.g. a video generation or project create).',
    inputSchema: z.toJSONSchema(z.object({ proposalId: z.string().min(8), ack: z.boolean().optional() })) as Record<string, unknown>
  }
  return [...reads, ...proposes, confirm]
}
```
*(`MCP_CONFIRM_TOOL` import avoids a magic string; the manifest dedup in `tools.post.ts` collapses the duplicate `confirm_action` when 2c also emits it.)*

- [ ] **Step 3c: Wire `tools.post.ts`** — replace the Task-2 `projectVideoReadTools(...)` line in the assembly with the full projection:
```ts
...projectVideoTools(role, { suite: process.env.MCP_VIDEO_TOOLS_ENABLED === 'true', gen: process.env.MCP_VIDEO_GEN_ENABLED === 'true' })
```
*(Drop the now-unused `projectVideoReadTools` import; keep the dedup filter from Task 2.)*

- [ ] **Step 3d: Wire `call.post.ts`** — add imports, flags, propose branch, confirm deps, rate-limit:
```ts
import {
  videoReadTools, executeVideoTool, executeVideoPropose, resolveVideoProposeAction, dispatchVideoConfirm
} from '~~/server/utils/ai/mcp/videoTools'
import { buildVideoReadRunner, buildVideoProposeDeps, buildVideoConfirmDeps } from '~~/server/utils/ai/mcp/videoRunner'
```
Flags (near `writeEnabled`):
```ts
const videoSuiteEnabled = process.env.MCP_VIDEO_TOOLS_ENABLED === 'true'
const videoGenEnabled = process.env.MCP_VIDEO_GEN_ENABLED === 'true'
const videoProposeAction = resolveVideoProposeAction(toolName) // 'video_generation' | 'video_project_create' | null
```
Rate-limit: extend the existing generation rate-limit guard to also cover video propose/create. Replace its `if (isGeneration && toolName !== 'get_generation_status')` guard so the counted set includes the video propose tools:
```ts
const rateLimited = (isGeneration && toolName !== 'get_generation_status') || toolName === 'propose_video_generation' || toolName === 'create_video_project'
if (rateLimited) {
  const since = `${MCP_GEN_RATE_WINDOW_MIN} minutes`
  const names = [...generationTools.map(t => t.name).filter(n => n !== 'get_generation_status'), 'propose_video_generation', 'create_video_project']
  const recent = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ai_action_audit WHERE user_id = $1 AND payload->>'source' = 'mcp' AND tool_name = ANY($2) AND created_at > now() - $3::interval`,
    [userId, names, since]).catch(() => ({ n: 0 }))
  if (isGenerationRateLimited(recent?.n ?? 0)) return { ok: false, error: 'Rate limit: too many generation requests. Try again in a few minutes.', code: 'rate_limited' }
}
```
Confirm branch — extend the existing `if (isConfirm)` to pass `enabled`, `writeEnabled`, and `videoDispatch` that injects the per-confirm idempotencyKey:
```ts
if (isConfirm) {
  const confirmDeps = buildVideoConfirmDeps()
  outcome = await executeWriteConfirm(args, ctx, {
    enabled: writeEnabled || videoGenEnabled,
    writeEnabled,
    getExecutor,
    claim: async (proposalId, uid) => queryOne<ClaimedProposal>(
      `UPDATE ai_pending_actions SET status='executed', confirmed_by=$2, executed_at=now()
        WHERE id = $1 AND user_id = $2 AND status='proposed' AND source='mcp' AND expires_at > now()
        RETURNING tool_name, resolved_payload`,
      [proposalId, uid]).catch(() => null),
    videoDispatch: async (row, vctx) => {
      // inject a deterministic idempotencyKey derived from the proposalId so a double-confirm cannot double-bill
      const pid = (typeof args === 'object' && args && 'proposalId' in (args as any)) ? String((args as any).proposalId) : ''
      const payload = row.tool_name === 'video_generation'
        ? { ...(row.resolved_payload as any), idempotencyKey: `mcp:${pid}` }
        : row.resolved_payload
      return dispatchVideoConfirm({ tool_name: row.tool_name, resolved_payload: payload }, vctx, { genEnabled: videoGenEnabled, ...confirmDeps })
    }
  })
}
```
Propose branch — add AFTER the existing `writeAction` branch, BEFORE `isGeneration`:
```ts
} else if (videoProposeAction) {
  outcome = await executeVideoPropose(videoProposeAction, args, ctx, {
    suiteEnabled: videoSuiteEnabled, genEnabled: videoGenEnabled, ...buildVideoProposeDeps()
  })
}
```
Read branch — (already added in Task 2) ensure `isVideoRead` branch is present before the final `else`.

- [ ] **Step 4: Run the full AI suite**

Run: `npx vitest run test/ai/`
Expected: PASS — new video flag-matrix + confirm-dispatch tests green; existing `mcpWriteTools` (13) + `mcpGenerationTools` (10) + all others **still green** (577 + new).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/mcp/writeTools.ts server/utils/ai/mcp/videoTools.ts server/api/internal/mcp/call.post.ts server/api/internal/mcp/tools.post.ts test/ai/mcpVideoTools.test.ts test/ai/mcpWriteTools.test.ts
git commit -m "feat(ai): MCP 2b wire propose/confirm — generalized confirm + videoDispatch, flags, rate-limit, manifest"
```

---

## Task 7: Dormant flags in wrangler.toml + full verification + docs note

**Files:**
- Modify: `wrangler.toml`
- Test: full `npx vitest run test/ai/`; lint new files.

- [ ] **Step 1: Add the two dormant flags** under the MCP block in `wrangler.toml [vars]` (commented, like 2c):
```toml
# MCP Phase 2b — video-generation suite over MCP. DORMANT: left UNSET (absent = off).
#  MCP_VIDEO_TOOLS_ENABLED  → discovery reads + status (no spend, no writes)
#  MCP_VIDEO_GEN_ENABLED    → confirm-tier propose_video_generation + create_video_project (bills; HITL confirm)
# Doubly-dormant: live-verify ALSO needs base VIDEO_GENERATION_ENABLED baked into [vars].
# MCP_VIDEO_TOOLS_ENABLED = "true"
# MCP_VIDEO_GEN_ENABLED = "true"
```

- [ ] **Step 2: Full test run**

Run: `npx vitest run test/ai/`
Expected: ALL PASS (no regressions; new `mcpVideoTools` suite green).

- [ ] **Step 3: Lint the new/changed files**

Run: `npx eslint server/utils/ai/mcp/videoTools.ts server/utils/ai/mcp/videoRunner.ts server/api/internal/mcp/call.post.ts server/api/internal/mcp/tools.post.ts`
Expected: clean (member-delimiter commas per repo eslint; fix any reported).

- [ ] **Step 4: Docs note (M1 — deferred activation)**

Add a single line to the spec's §10 / handoff noting the suite ships dormant and the connector page + `features/ai-connectors` copy is updated **at go-live**, not now (the tools are invisible until the flags flip).

- [ ] **Step 5: Final commit**

```bash
git add wrangler.toml docs/superpowers/specs/2026-06-21-mcp-phase2b-video-generation-design.md
git commit -m "chore(ai): MCP 2b dormant flags in wrangler.toml + go-live docs note"
```

---

## Self-Review

**Spec coverage:**
- §3 architecture (videoTools pure + videoRunner bindings) → Tasks 1,2,5. ✅
- §4.1 four reads → Tasks 1,2. ✅
- §4.2 propose_video_generation (cost+compliance preview, no spend) → Task 3; confirm reserve+enqueue + cap_exceeded → Tasks 4,6; create_video_project → Tasks 3,4,5. ✅
- §5 dedicated `MCP_VIDEO_TOOLS_ENABLED` + `MCP_VIDEO_GEN_ENABLED`, browse-only middle state → Tasks 6,7. ✅
- §6 financial boundary (not in safe set, own flags, writeEnabled gating) → Task 6. ✅; cap re-checked at confirm → Task 4; no double-bill (idempotencyKey from proposalId) → Task 5/6. ✅
- §7 all modes pass through; no upload tool → Task 3 (`VideoGenParams.mode` enum; sourceAssetIds accepted, no new upload tool). ✅
- §8 doubly-dormant dependency → Task 7 comment. ✅
- §9 tests → Tasks 1,3,4,6. ✅
- §10 marketing/docs at go-live → Task 7 (deferred note). ✅
- §11 operator live-verify → out of plan scope (operator step). ✅

**Placeholder scan:** none — every code step contains complete code; binding wiring uses exact engine signatures gathered from source.

**Type consistency:** `video_generation` / `video_project_create` used identically across `VIDEO_CONFIRM_ACTIONS`, `resolveVideoProposeAction`, `persist`, `dispatchVideoConfirm`, the claim routing. `ClaimedProposal` (writeTools) ↔ `ClaimedRow` (videoTools) share the `{ tool_name, resolved_payload }` shape; `videoDispatch` receives the writeTools `ClaimedProposal` and forwards it — compatible structurally. `VideoConfirmOutcome.cap_exceeded` is also added to `WriteConfirmOutcome`'s union so the endpoint returns one shape.

**Note for the executor:** `loadTenantVideoGenerationPolicy` is called inside `buildVideoConfirmDeps().reserve` (await before passing to `reserveAndCreateVideoGenerationJob`) — keep that await; it mirrors the original handler. If `selectableVideoModelOptions` import path (`~~/app/utils/video/modelPresentation`) fails to resolve under Nitro, inline the mapping in `videoRunner.ts` (it is a pure presenter) — the original `models.get.ts` imports it from the same path, so it resolves.
