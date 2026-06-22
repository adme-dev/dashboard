# Banner Render over MCP (#2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Banner Studio MP4 rendering to external AI hosts over MCP — discovery reads + a confirm-tier propose/confirm that drives the #2a async pipeline.

**Architecture:** Mirror the existing 2b *video* MCP tools (`server/utils/ai/mcp/videoTools.ts` + `videoRunner.ts`). Two new files: `bannerTools.ts` (pure descriptors + manifest projection + execute funcs) and `bannerRunner.ts` (read runner + propose deps + confirm dispatch). On confirm, the dispatch loads the named project's layers, builds HTML server-side, and enqueues to #2a. Wire into `internal/mcp/{tools,call}.post.ts` + a `bannerDispatch` hook in `writeTools.ts`. Dormant behind `MCP_BANNER_TOOLS_ENABLED`.

**Tech Stack:** Nitro, Zod, Neon, Vitest. Spec: `docs/superpowers/specs/2026-06-22-mcp-banner-render-2b-design.md` (read §8 Implementation map — exact signatures).

## Global Constraints
- **Mirror the video tools exactly** for the manifest/execute/propose machinery — implementers should READ `server/utils/ai/mcp/videoTools.ts` and `videoRunner.ts` and adapt, not invent. Banner is the simpler case (3 tools, simpler payload, no models/policy/cost/budget).
- **Tools (3):** `list_banner_projects` (read), `get_banner_render_status` (read), `propose_banner_render` (confirm-tier write). Plus the existing `confirm_action` gains a banner dispatch path.
- **RBAC = `CREATIVE`** on all three (re-checked in execute + at dispatch).
- **Flag `MCP_BANNER_TOOLS_ENABLED`** gates the manifest (reads + propose), exactly as `MCP_VIDEO_TOOLS_ENABLED` gates the video suite.
- **Non-financial, NOT D4.** No cost/budget/cap. A confirm-tier write is the only gate.
- **Confirm action name:** `'banner_render'`. Propose payload: `{ projectId, format, fps, quality }`.
- **Confirm dispatch chain (exact, verified signatures):**
  `const { layers, width, height } = await loadBannerLayers(projectId, format)` (`~~/server/utils/audio/bannerOverlay.ts`)
  → `const html = buildBannerHTML(format, layers, { baseUrl })` (`~~/server/utils/banner/htmlBuilder.ts` — **format FIRST**)
  → `enqueueBannerRender({ projectId, formats:[{ key: format, html, width, height }], fps, quality, userId }, deps)` (`~~/server/utils/banner/renderJob.ts`).
- **No migration; no worker change.** Reuses `banner_render_jobs` (#2a) + `ai_pending_actions` (mig 189). Render also needs #2a activated (queues+container) to actually run.
- **Imports** `~~/server/...`; pure handlers never throw (typed outcomes); reads return compact projections; project/job text untrusted.
- **Test commands:** per-file `npx vitest run test/ai/<file>.test.ts`; suite `npx vitest run test/ai/`.

---

### Task 1: `bannerTools.ts` — descriptors, manifest projection, execute

**Files:**
- Create: `server/utils/ai/mcp/bannerTools.ts`
- Test: `test/ai/mcpBannerTools.test.ts`

**Interfaces produced:**
- `interface BannerToolDescriptor { name, description, inputSchema, mutates?, requiredPermission }` (mirror `VideoToolDescriptor`)
- `const bannerReadTools: BannerToolDescriptor[]` (`list_banner_projects`, `get_banner_render_status`)
- `const bannerProposeTools: BannerToolDescriptor[]` (`propose_banner_render`)
- `const BANNER_CONFIRM_ACTIONS = ['banner_render'] as const`; `resolveBannerProposeAction(name): 'banner_render'|null`
- `projectBannerTools(role, enabled): McpToolManifest[]` (empty unless `enabled`; reads + propose, role-filtered on CREATIVE)
- `type BannerReadRunner = Record<string, (args: unknown, ctx: ToolContext) => Promise<unknown>>`
- `executeBannerTool(runner, name, args, ctx, enabled): Promise<BannerExecuteOutcome>` and `executeBannerPropose(name, args, ctx, deps, enabled): Promise<BannerProposeOutcome>` (mirror `executeVideoTool`/`executeVideoPropose`: flag→disabled, unknown→not_found, RBAC→forbidden, bad args→bad_args, then run)
- `interface BannerProposeDeps { resolveProject, persist }` and `interface BannerRenderPendingPayload { projectId, format, fps, quality }`

- [ ] **Step 1: Write the failing test**

```ts
// test/ai/mcpBannerTools.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  bannerReadTools, bannerProposeTools, projectBannerTools, resolveBannerProposeAction,
  executeBannerTool, executeBannerPropose, type BannerReadRunner, type BannerProposeDeps,
} from '~~/server/utils/ai/mcp/bannerTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const creativeCtx: ToolContext = { userId: 'u2', userRole: 'creative', event: {} as any }
const outsiderCtx: ToolContext = { userId: 'u3', userRole: 'finance', event: {} as any }

describe('banner tool manifest', () => {
  it('is empty when the flag is off, and lists 3 tools (read+propose) for CREATIVE when on', () => {
    expect(projectBannerTools('owner', false)).toEqual([])
    const names = projectBannerTools('owner', true).map(t => t.name).sort()
    expect(names).toEqual(['get_banner_render_status', 'list_banner_projects', 'propose_banner_render'])
  })
  it('hides all banner tools from a non-CREATIVE role even when enabled', () => {
    expect(projectBannerTools('finance', true)).toEqual([])
  })
  it('propose_banner_render is the only confirm action', () => {
    expect(resolveBannerProposeAction('propose_banner_render')).toBe('banner_render')
    expect(resolveBannerProposeAction('list_banner_projects')).toBeNull()
  })
})

describe('executeBannerTool (reads)', () => {
  const runner: BannerReadRunner = {
    list_banner_projects: vi.fn().mockResolvedValue({ projects: [{ id: 'p1', name: 'Acme', formats: ['mrec'], updatedAt: 't' }] }),
    get_banner_render_status: vi.fn().mockResolvedValue({ jobs: [] }),
  }
  it('returns disabled when the flag is off', async () => {
    const r = await executeBannerTool(runner, 'list_banner_projects', {}, creativeCtx, false)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('disabled')
  })
  it('forbids a non-CREATIVE role', async () => {
    const r = await executeBannerTool(runner, 'list_banner_projects', {}, outsiderCtx, true)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('forbidden')
  })
  it('runs the read for CREATIVE when enabled', async () => {
    const r = await executeBannerTool(runner, 'list_banner_projects', {}, creativeCtx, true)
    expect(r.ok).toBe(true); expect((r as any).data.projects).toHaveLength(1)
  })
  it('not_found for an unknown tool', async () => {
    const r = await executeBannerTool(runner, 'nope', {}, ctx, true)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('not_found')
  })
})

describe('executeBannerPropose', () => {
  const deps: BannerProposeDeps = {
    resolveProject: vi.fn().mockResolvedValue({ id: 'p1', name: 'Acme', formats: ['mrec'] }),
    persist: vi.fn().mockResolvedValue({ proposalId: 'prop1' }),
  }
  it('validates project+format and persists a banner_render proposal', async () => {
    const r = await executeBannerPropose('propose_banner_render',
      { project: 'Acme', format: 'mrec', fps: 30, quality: 1 }, creativeCtx, deps, true)
    expect(r.ok).toBe(true)
    expect((r as any).proposalId).toBe('prop1')
    expect((deps.persist as any).mock.calls[0][1]).toBe('banner_render') // action name
    expect((deps.persist as any).mock.calls[0][2]).toMatchObject({ projectId: 'p1', format: 'mrec', fps: 30, quality: 1 })
  })
  it('bad_args when the format is not on the project', async () => {
    const d2: BannerProposeDeps = { resolveProject: vi.fn().mockResolvedValue({ id: 'p1', name: 'Acme', formats: ['leader'] }), persist: vi.fn() }
    const r = await executeBannerPropose('propose_banner_render', { project: 'Acme', format: 'mrec' }, creativeCtx, d2, true)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('bad_args')
    expect(d2.persist).not.toHaveBeenCalled()
  })
  it('disabled when the flag is off; forbidden for non-CREATIVE', async () => {
    expect((await executeBannerPropose('propose_banner_render', { project: 'Acme', format: 'mrec' }, creativeCtx, deps, false) as any).code).toBe('disabled')
    expect((await executeBannerPropose('propose_banner_render', { project: 'Acme', format: 'mrec' }, outsiderCtx, deps, true) as any).code).toBe('forbidden')
  })
})
```

- [ ] **Step 2: Run → fail** — `npx vitest run test/ai/mcpBannerTools.test.ts` (module missing).

- [ ] **Step 3: Implement `bannerTools.ts`** by mirroring `server/utils/ai/mcp/videoTools.ts` (READ it). Adapt:
  - `BannerToolDescriptor` ≡ `VideoToolDescriptor`; `McpToolManifest` imported from `./project`.
  - `bannerReadTools`: `list_banner_projects` (inputSchema: `z.object({})`), `get_banner_render_status` (`z.object({ jobIds: z.array(z.string()).min(1).max(20) })`), both `requiredPermission: 'CREATIVE'`.
  - `bannerProposeTools`: `propose_banner_render` (`z.object({ project: z.string().min(1), format: z.string().min(1), fps: z.number().int().min(12).max(60).default(30), quality: z.union([z.literal(1), z.literal(2)]).default(1) })`, `mutates: true`, `requiredPermission: 'CREATIVE'`).
  - `projectBannerTools(role, enabled)`: if `!enabled` return `[]`; else read tools + propose tools filtered by `roleHasPermission(role,'CREATIVE')`, mapped to `{ name, description, inputSchema: z.toJSONSchema(schema) }`.
  - `executeBannerTool` / `executeBannerPropose`: copy the gating ladder from `executeVideoTool`/`executeVideoPropose` (disabled→forbidden→not_found→bad_args→run). `executeBannerPropose` validates `args.format` is in `resolveProject(...).formats` (else `bad_args`), resolves `project`→`{id,name,formats}`, then `deps.persist(ctx, 'banner_render', { projectId, format, fps, quality })` → `{ ok:true, proposalId }`.
  - `BANNER_CONFIRM_ACTIONS = ['banner_render'] as const`; `resolveBannerProposeAction(name)` returns `'banner_render'` for `propose_banner_render` else null.
  - Outcome unions mirror `VideoExecuteOutcome`/`VideoProposeOutcome` (codes: `disabled|not_found|forbidden|bad_args|handler_error`).

- [ ] **Step 4: Run → pass** — `npx vitest run test/ai/mcpBannerTools.test.ts` (all pass).

- [ ] **Step 5: Commit** — `git add server/utils/ai/mcp/bannerTools.ts test/ai/mcpBannerTools.test.ts && git commit -m "feat(mcp): banner tool descriptors + manifest + execute (#2b)"`

---

### Task 2: `bannerRunner.ts` — read runner, propose deps, confirm dispatch

**Files:**
- Create: `server/utils/ai/mcp/bannerRunner.ts`
- Test: `test/ai/mcpBannerRunner.test.ts`

**Interfaces:**
- Consumes Task 1 types (`BannerReadRunner`, `BannerProposeDeps`, `BannerRenderPendingPayload`).
- Produces: `buildBannerReadRunner(): BannerReadRunner`; `buildBannerProposeDeps(): BannerProposeDeps`; `dispatchBannerConfirm(payload: BannerRenderPendingPayload, ctx, deps): Promise<{ ok:true, data:{ jobIds:string[] } } | { ok:false, error:string }>`; `buildBannerConfirmDeps()`.

- [ ] **Step 1: Write the failing test**

```ts
// test/ai/mcpBannerRunner.test.ts
import { describe, it, expect, vi } from 'vitest'
import { dispatchBannerConfirm, type BannerConfirmDeps } from '~~/server/utils/ai/mcp/bannerRunner'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'creative', event: {} as any }
const payload = { projectId: 'p1', format: 'mrec', fps: 30, quality: 1 as const }

function deps(over: Partial<BannerConfirmDeps> = {}): BannerConfirmDeps {
  return {
    loadLayers: vi.fn().mockResolvedValue({ layers: [{ id: 'l1' }], width: 300, height: 250 }),
    buildHtml: vi.fn().mockReturnValue('<div>banner</div>'),
    enqueue: vi.fn().mockResolvedValue({ jobIds: ['job1'] }),
    ...over,
  }
}

describe('dispatchBannerConfirm', () => {
  it('loads layers, builds HTML (format first), enqueues, returns jobIds', async () => {
    const d = deps()
    const r = await dispatchBannerConfirm(payload, ctx, d)
    expect(r.ok).toBe(true)
    expect((r as any).data.jobIds).toEqual(['job1'])
    expect((d.loadLayers as any).mock.calls[0]).toEqual(['p1', 'mrec'])
    expect((d.buildHtml as any).mock.calls[0][0]).toBe('mrec')             // format FIRST
    expect((d.buildHtml as any).mock.calls[0][1]).toEqual([{ id: 'l1' }])  // then layers
    const enqArg = (d.enqueue as any).mock.calls[0][0]
    expect(enqArg).toMatchObject({ projectId: 'p1', fps: 30, quality: 1, userId: 'u1' })
    expect(enqArg.formats[0]).toMatchObject({ key: 'mrec', html: '<div>banner</div>', width: 300, height: 250 })
  })
  it('fails gracefully (no enqueue) when the project/format cannot load', async () => {
    const d = deps({ loadLayers: vi.fn().mockRejectedValue(new Error('no format')) })
    const r = await dispatchBannerConfirm(payload, ctx, d)
    expect(r.ok).toBe(false)
    expect(d.enqueue).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run → fail** — `npx vitest run test/ai/mcpBannerRunner.test.ts`.

- [ ] **Step 3: Implement `bannerRunner.ts`** (mirror `videoRunner.ts` structure):

```ts
// server/utils/ai/mcp/bannerRunner.ts
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { loadBannerLayers } from '~~/server/utils/audio/bannerOverlay'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { enqueueBannerRender, projectJobStatus, type BannerJobRow } from '~~/server/utils/banner/renderJob'
import { proposeAction } from '~~/server/utils/ai/pendingActions'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { escapeLike } from '~~/server/utils/ai/toolContext'
import { FORMATS } from '~~/app/utils/banner-constants'
import { uploadFile } from '~~/server/utils/storage'
import { randomUUID } from 'uncrypto'
import type { BannerReadRunner, BannerProposeDeps } from './bannerTools'

export interface BannerRenderPendingPayload { projectId: string, format: string, fps: number, quality: 1 | 2 }

/** Resolve a banner project for the actor: name-or-id → { id, name, formats }. Scope: banner studio is staff-wide. */
async function resolveBannerProject(nameOrId: string): Promise<{ id: string, name: string, formats: string[] } | null> {
  const row = await queryOne<{ id: string, name: string, canvas_data: any }>(
    `SELECT id, name, canvas_data FROM banner_projects WHERE id::text = $1 OR name ILIKE $2 ORDER BY (id::text = $1) DESC, name ASC LIMIT 1`,
    [nameOrId, `%${escapeLike(nameOrId)}%`],
  )
  if (!row) return null
  const artboards = row.canvas_data?.artboards ?? row.canvas_data?.formats ?? {}
  const formats = Object.keys(artboards).filter(k => k in FORMATS)
  return { id: row.id, name: row.name, formats }
}

export function buildBannerReadRunner(): BannerReadRunner {
  return {
    list_banner_projects: async () => {
      const rows = await queryRows<{ id: string, name: string, canvas_data: any, updated_at: string }>(
        `SELECT id, name, canvas_data, updated_at FROM banner_projects ORDER BY updated_at DESC LIMIT 50`, [])
      return {
        projects: rows.map(r => {
          const ab = r.canvas_data?.artboards ?? r.canvas_data?.formats ?? {}
          return { id: r.id, name: r.name, formats: Object.keys(ab).filter(k => k in FORMATS), updatedAt: r.updated_at }
        }),
      }
    },
    get_banner_render_status: async (raw) => {
      const ids = ((raw as { jobIds?: string[] }).jobIds ?? []).slice(0, 20)
      if (!ids.length) return { jobs: [] }
      const rows = await queryRows<BannerJobRow>(
        `SELECT id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, status, url, file_size, error
           FROM banner_render_jobs WHERE id = ANY($1)`, [ids])
      return { jobs: projectJobStatus(rows) }
    },
  }
}

export function buildBannerProposeDeps(): BannerProposeDeps {
  return {
    resolveProject: resolveBannerProject,
    persist: (ctx, action, payload) => proposeAction(ctx, null, action, payload),
  }
}

export interface BannerConfirmDeps {
  loadLayers: (projectId: string, format: string) => Promise<{ layers: any[], width: number, height: number }>
  buildHtml: (format: string, layers: any[], options: { baseUrl: string }) => string
  enqueue: (input: { projectId: string, formats: { key: string, html: string, width: number, height: number }[], fps: number, quality: 1 | 2, userId: string }, deps: any) => Promise<{ jobIds: string[] }>
}

export async function dispatchBannerConfirm(payload: BannerRenderPendingPayload, ctx: ToolContext, deps: BannerConfirmDeps): Promise<{ ok: true, data: { jobIds: string[] } } | { ok: false, error: string }> {
  try {
    const { layers, width, height } = await deps.loadLayers(payload.projectId, payload.format)
    const baseUrl = process.env.NUXT_PUBLIC_APP_URL ?? process.env.R2_PUBLIC_URL ?? ''
    const html = deps.buildHtml(payload.format, layers, { baseUrl })
    const enqueueDeps = {
      genId: () => randomUUID(),
      putSourceHtml: async (key: string, h: string) => { await uploadFile(Buffer.from(h, 'utf8'), key, 'text/html') },
      insertJob: async (r: any) => { await execute(
        `INSERT INTO banner_render_jobs (id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [r.id, r.project_id, r.format_key, r.width, r.height, r.fps, r.crf, r.quality, r.source_r2_key, r.created_by]) },
      sendQueue: async (msg: { jobId: string }) => {
        const q = (ctx.event.context as any).cloudflare?.env?.BANNER_RENDER_QUEUE
        if (!q) throw new Error('BANNER_RENDER_QUEUE unavailable')
        await q.send(msg)
      },
    }
    const { jobIds } = await deps.enqueue({ projectId: payload.projectId, formats: [{ key: payload.format, html, width, height }], fps: payload.fps, quality: payload.quality, userId: ctx.userId }, enqueueDeps)
    return { ok: true, data: { jobIds } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'banner render dispatch failed' }
  }
}

export function buildBannerConfirmDeps(): BannerConfirmDeps {
  return {
    loadLayers: loadBannerLayers,
    buildHtml: buildBannerHTML,
    enqueue: enqueueBannerRender as any,
  }
}
```

(The default `enqueue` is #2a's `enqueueBannerRender(input, deps)`; the test injects a stub. `crf` is defaulted inside `enqueueBannerRender`/the job insert path — pass the renderJob defaults; if `enqueueBannerRender`'s signature needs `crf`, supply `crf: 23` in the input — confirm against `renderJob.ts` `BannerRenderInput` when implementing.)

- [ ] **Step 4: Run → pass** — `npx vitest run test/ai/mcpBannerRunner.test.ts`.

- [ ] **Step 5: Commit** — `git add server/utils/ai/mcp/bannerRunner.ts test/ai/mcpBannerRunner.test.ts && git commit -m "feat(mcp): banner read runner + propose deps + confirm dispatch (#2b)"`

---

### Task 3: Wire into the MCP endpoints + flag + projection test

**Files:**
- Modify: `server/api/internal/mcp/tools.post.ts` (add banner manifest, flag-gated)
- Modify: `server/api/internal/mcp/call.post.ts` (route banner reads/propose; add `bannerDispatch` to confirm deps)
- Modify: `server/utils/ai/mcp/writeTools.ts` (add optional `bannerDispatch` to `ConfirmDeps`, tried before the 2c safe-action path)
- Modify: `wrangler.toml` (add `MCP_BANNER_TOOLS_ENABLED` to `[vars]`, value `"false"` — dormant)
- Test: `test/ai/mcpBannerWiring.test.ts`

**Interfaces:** consumes Task 1 (`projectBannerTools`, `executeBannerTool`, `executeBannerPropose`, `resolveBannerProposeAction`) + Task 2 (`buildBannerReadRunner`, `buildBannerProposeDeps`, `dispatchBannerConfirm`, `buildBannerConfirmDeps`).

- [ ] **Step 1: Write the failing test** (the pure, verifiable seam — `writeTools.ts` trying `bannerDispatch` before the 2c path):

```ts
// test/ai/mcpBannerWiring.test.ts
import { describe, it, expect, vi } from 'vitest'
import { executeWriteConfirm, type ConfirmDeps } from '~~/server/utils/ai/mcp/writeTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'creative', event: {} as any }

function baseDeps(over: Partial<ConfirmDeps> = {}): ConfirmDeps {
  return {
    enabled: true,
    claim: vi.fn().mockResolvedValue({ tool_name: 'banner_render', resolved_payload: { projectId: 'p1', format: 'mrec', fps: 30, quality: 1 } }),
    getExecutor: vi.fn().mockReturnValue(null),
    ...over,
  }
}

describe('executeWriteConfirm — banner dispatch', () => {
  it('routes a claimed banner_render proposal to bannerDispatch', async () => {
    const bannerDispatch = vi.fn().mockResolvedValue({ ok: true, data: { jobIds: ['job1'] } })
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, baseDeps({ bannerDispatch }))
    expect(r.ok).toBe(true)
    expect((r as any).data.jobIds).toEqual(['job1'])
    expect(bannerDispatch).toHaveBeenCalled()
  })
  it('falls through (bannerDispatch returns null) for non-banner tool_names', async () => {
    const bannerDispatch = vi.fn().mockResolvedValue(null)
    const claim = vi.fn().mockResolvedValue({ tool_name: 'create_task', resolved_payload: {} })
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, baseDeps({ bannerDispatch, claim, writeEnabled: false }))
    // write group off + not banner → forbidden (the 2c path), proving fall-through past bannerDispatch
    expect(r.ok).toBe(false)
    expect((r as any).code).toBe('forbidden')
  })
})
```

- [ ] **Step 2: Run → fail** — `npx vitest run test/ai/mcpBannerWiring.test.ts` (`bannerDispatch` not on `ConfirmDeps`).

- [ ] **Step 3: Add `bannerDispatch` to `writeTools.ts`** — mirror the existing `videoDispatch` block in `executeWriteConfirm` (READ it). Add `bannerDispatch?: (row: ClaimedProposal, ctx: ToolContext) => Promise<WriteConfirmOutcome | null>` to `ConfirmDeps`, and after the `videoDispatch` try-block (before the 2c `writeEnabled` path) add:
```ts
  if (deps.bannerDispatch) {
    const bo = await deps.bannerDispatch(row, ctx)
    if (bo) return bo
  }
```

- [ ] **Step 4: Wire the endpoints** (READ the current files + mirror the video wiring):
  - `tools.post.ts`: `import { projectBannerTools } from '~~/server/utils/ai/mcp/bannerTools'`; add `...projectBannerTools(role, bannerEnabled)` to the manifest, where `bannerEnabled = process.env.MCP_BANNER_TOOLS_ENABLED === 'true'` (mirror how `MCP_VIDEO_TOOLS_ENABLED` is read).
  - `call.post.ts`: route `list_banner_projects`/`get_banner_render_status` via `executeBannerTool(buildBannerReadRunner(), name, args, ctx, bannerEnabled)`; route `propose_banner_render` via `executeBannerPropose(name, args, ctx, buildBannerProposeDeps(), bannerEnabled)`; pass `bannerDispatch` into the `executeWriteConfirm` deps:
    ```ts
    bannerDispatch: async (row, ctx) => {
      if (row.tool_name !== 'banner_render') return null
      return await dispatchBannerConfirm(row.resolved_payload as BannerRenderPendingPayload, ctx, buildBannerConfirmDeps())
    }
    ```
    and ensure `confirm_action` is offered when `bannerEnabled` too (extend the existing "any confirm group on" condition).
  - `wrangler.toml`: add `MCP_BANNER_TOOLS_ENABLED = "false"` to `[vars]`.

- [ ] **Step 5: Run → pass** + full suite — `npx vitest run test/ai/mcpBannerWiring.test.ts` then `npx vitest run test/ai/` (all green, no regressions).

- [ ] **Step 6: Lint the new files** — `npx eslint server/utils/ai/mcp/bannerTools.ts server/utils/ai/mcp/bannerRunner.ts` (note: matches existing `mcp/*.ts` style; pre-existing `@stylistic` baseline applies as for the rest of the dir).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(mcp): wire banner tools into internal MCP endpoints + flag (#2b)"`

---

## Self-Review
**Spec coverage:** §2 tool 1/2 (reads) → Task 1 descriptors + Task 2 runner; §2 tool 3 (propose) → Task 1 executeBannerPropose + Task 2 propose deps; §2 confirm bannerDispatch → Task 2 dispatchBannerConfirm + Task 3 writeTools/call wiring; §3 wiring → Task 3; §4 RBAC CREATIVE/flag/non-financial → Tasks 1+3; §6 testing → each task's tests + full suite; §7 no migration/worker → none. ✓
**Placeholders:** Task 1 & 3 implementation steps point implementers at exact mirror files (videoTools.ts / videoRunner.ts / writeTools.ts videoDispatch) with the banner deltas given — legitimate for mirror-tasks; Task 2 has complete code. One flagged confirm: `enqueueBannerRender` input may need `crf` — implementer verifies against `renderJob.ts BannerRenderInput` (Task 2 note). No TBD/TODO.
**Type consistency:** `BannerRenderPendingPayload {projectId,format,fps,quality}` consistent across Tasks 1/2/3; dispatch chain signatures match the verified spec §8; `projectJobStatus`/`BannerJobRow` reused from #2a renderJob.ts.

## Execution Handoff
Pick an execution approach (see end of message).
