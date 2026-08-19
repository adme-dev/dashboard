import { describe, it, expect, vi } from 'vitest'

import { executeVideoPropose, dispatchVideoConfirm, type VideoGenerationPendingPayload, type VideoProjectPendingPayload } from '~~/server/utils/ai/mcp/videoTools'
import { executeWriteConfirm } from '~~/server/utils/ai/mcp/writeTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

/**
 * 2b INTEGRATION / battle test. Unlike mcpVideoTools.test.ts (which unit-tests each function in
 * isolation), this drives the WHOLE confirm-tier flow end-to-end the way server/api/internal/mcp/
 * call.post.ts wires it: propose → persist (in-memory ai_pending_actions) → atomic single-use claim →
 * executeWriteConfirm → videoDispatch → dispatchVideoConfirm → (stub) engine reserve/enqueue. Only the
 * DB and the CF-bound engine are stubbed at the boundary; every MCP function is the real one. This is
 * the strongest verification possible without activating the dormant flags against a live tenant.
 */

vi.mock('~~/server/utils/permissions', () => ({ roleHasPermission: (role: string) => role === 'admin' }))

const ctx = (role = 'admin'): ToolContext => ({ userId: 'u1', userRole: role, event: {} as never, source: 'mcp' })

interface PendingRow { id: string, user_id: string, tool_name: string, resolved_payload: unknown, status: string, source: string }

// In-memory ai_pending_actions + a claim that mirrors the real atomic single-use SQL
// (UPDATE … WHERE id AND user_id AND status='proposed' AND source='mcp' RETURNING …).
function makeStore() {
  const rows = new Map<string, PendingRow>()
  let seq = 0
  return {
    rows,
    persist: async (_c: ToolContext, action: string, payload: unknown): Promise<string> => {
      const id = `prop-${++seq}-abcdef`
      rows.set(id, { id, user_id: 'u1', tool_name: action, resolved_payload: payload, status: 'proposed', source: 'mcp' })
      return id
    },
    claim: async (proposalId: string, userId: string) => {
      const row = rows.get(proposalId)
      if (!row || row.status !== 'proposed' || row.source !== 'mcp' || row.user_id !== userId) return null
      row.status = 'executed'
      return { tool_name: row.tool_name, resolved_payload: row.resolved_payload }
    }
  }
}

function makeEngine() {
  const enqueued: string[] = []
  const reserve = vi.fn(async (payload: VideoGenerationPendingPayload) => ({ ok: true, reused: false, job: { id: 'job-1', ...payload } }))
  const enqueue = vi.fn(async (_payload: VideoGenerationPendingPayload, jobId: string) => {
    enqueued.push(jobId)
  })
  const createProject = vi.fn(async (_payload: VideoProjectPendingPayload) => ({ projectId: 'proj-1' }))
  return { enqueued, confirmDeps: { reserve, enqueue, createProject } }
}

type Store = ReturnType<typeof makeStore>
type Engine = ReturnType<typeof makeEngine>

function proposeDeps(store: Store, over: Record<string, unknown> = {}) {
  return {
    suiteEnabled: true,
    genEnabled: true,
    resolveProject: async () => ({ project: { mediaType: 'av', clientId: 'c1', createdBy: 'u1', currentTimelineId: 't1' }, timeline: { id: 't1' } }),
    getModel: () => ({ id: 'm1', provider: 'cf', modes: ['text-to-video'], durationsSeconds: [5], aspectRatios: ['16:9'], resolutions: [], allowedSubjectTypes: ['unknown'], requiresApprovedSourceAsset: false }),
    isTenantModel: () => true,
    loadSources: async () => [],
    loadPolicy: async () => ({ enabled: true, monthlyCapCents: 100000 }),
    evaluateCompliance: () => ({ allowed: true, classification: 'clear', reasons: [] as string[] }),
    estimateCost: () => 250,
    persist: store.persist,
    ...over
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

// Reproduce the call.post.ts confirm wiring exactly (the integration point that is otherwise untested).
function confirmAction(proposalId: string, store: Store, engine: Engine, opts: { writeEnabled?: boolean, videoGenEnabled?: boolean } = {}) {
  const writeEnabled = opts.writeEnabled ?? false
  const videoGenEnabled = opts.videoGenEnabled ?? true
  return executeWriteConfirm({ proposalId }, ctx(), {
    enabled: writeEnabled || videoGenEnabled,
    writeEnabled,
    getExecutor: () => null,
    claim: store.claim,
    videoDispatch: async (row, vctx) => {
      const payload = row.tool_name === 'video_generation'
        ? { ...(row.resolved_payload as Record<string, unknown>), idempotencyKey: `mcp:${proposalId}` }
        : row.resolved_payload
      return dispatchVideoConfirm({ tool_name: row.tool_name, resolved_payload: payload }, vctx, { genEnabled: videoGenEnabled, ...engine.confirmDeps })
    }
  })
}

const genArgs = {
  projectId: '11111111-1111-4111-8111-111111111111',
  mode: 'text-to-video', modelId: 'm1', prompt: 'a calm city street at dawn',
  durationSeconds: 5, aspectRatio: '16:9', subjectType: 'unknown'
}

const dataOf = (r: { ok: boolean, data?: unknown }) => r.data as Record<string, unknown>

describe('2b end-to-end flow (propose → persist → claim → confirm → dispatch)', () => {
  it('happy path: propose previews cost; confirm reserves + enqueues once; idempotencyKey = mcp:<proposalId>', async () => {
    const store = makeStore()
    const engine = makeEngine()

    const proposed = await executeVideoPropose('video_generation', genArgs, ctx(), proposeDeps(store))
    expect(proposed.ok).toBe(true)
    const proposalId = String(dataOf(proposed).proposalId)
    expect(dataOf(proposed).estimatedCostCents).toBe(250)
    expect(store.rows.get(proposalId)?.status).toBe('proposed')

    const confirmed = await confirmAction(proposalId, store, engine)
    expect(confirmed.ok).toBe(true)
    expect(dataOf(confirmed).jobId).toBe('job-1')
    // the FROZEN propose payload flowed into reserve, with the confirm-injected idempotency key
    expect(engine.confirmDeps.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: genArgs.projectId, estimatedCostCents: 250, idempotencyKey: `mcp:${proposalId}` }),
      expect.anything()
    )
    expect(engine.enqueued).toEqual(['job-1'])
    expect(store.rows.get(proposalId)?.status).toBe('executed')
  })

  it('single-use: a second confirm of the same proposal is rejected and does not double-spend', async () => {
    const store = makeStore()
    const engine = makeEngine()
    const proposed = await executeVideoPropose('video_generation', genArgs, ctx(), proposeDeps(store))
    const proposalId = String(dataOf(proposed).proposalId)

    expect((await confirmAction(proposalId, store, engine)).ok).toBe(true)
    const second = await confirmAction(proposalId, store, engine)
    expect(second).toMatchObject({ ok: false, code: 'expired' })
    expect(engine.confirmDeps.reserve).toHaveBeenCalledTimes(1)
    expect(engine.enqueued).toEqual(['job-1'])
  })

  it('compliance block at propose → nothing persisted (no confirmable proposal)', async () => {
    const store = makeStore()
    const proposed = await executeVideoPropose('video_generation', genArgs, ctx(),
      proposeDeps(store, { evaluateCompliance: () => ({ allowed: false, classification: 'prohibited', reasons: ['vehicle policy'] }) }))
    expect(proposed).toMatchObject({ ok: false, code: 'compliance_blocked' })
    expect(store.rows.size).toBe(0)
  })

  it('cap at confirm → cap_exceeded, claim consumed, no enqueue', async () => {
    const store = makeStore()
    const engine = makeEngine()
    engine.confirmDeps.reserve = vi.fn(async () => ({ ok: false, reason: 'tenant_cap_exceeded', remainingCents: 0, job: undefined, reused: false }))
    const proposed = await executeVideoPropose('video_generation', genArgs, ctx(), proposeDeps(store))
    const proposalId = String(dataOf(proposed).proposalId)

    const confirmed = await confirmAction(proposalId, store, engine)
    expect(confirmed).toMatchObject({ ok: false, code: 'cap_exceeded' })
    expect(engine.enqueued).toEqual([])
    expect(store.rows.get(proposalId)?.status).toBe('executed') // claim is single-use even on cap
  })

  it('browse-only (video gen flag off): propose is disabled', async () => {
    const store = makeStore()
    const proposed = await executeVideoPropose('video_generation', genArgs, ctx(), proposeDeps(store, { genEnabled: false }))
    expect(proposed).toMatchObject({ ok: false, code: 'disabled' })
    expect(store.rows.size).toBe(0)
  })

  it('create_video_project end-to-end: propose → confirm creates the project', async () => {
    const store = makeStore()
    const engine = makeEngine()
    const proposed = await executeVideoPropose('video_project_create', { title: 'New AV' }, ctx(), proposeDeps(store))
    const proposalId = String(dataOf(proposed).proposalId)
    const confirmed = await confirmAction(proposalId, store, engine)
    expect(confirmed).toEqual({ ok: true, data: { projectId: 'proj-1' } })
  })

  it('video-only deployment: a 2c row cannot be confirmed when writeEnabled is off', async () => {
    const store = makeStore()
    const engine = makeEngine()
    const id = await store.persist(ctx(), 'create_task', { boardId: 'b1' })
    const confirmed = await confirmAction(id, store, engine, { writeEnabled: false, videoGenEnabled: true })
    expect(confirmed).toMatchObject({ ok: false, code: 'forbidden' })
  })
})
