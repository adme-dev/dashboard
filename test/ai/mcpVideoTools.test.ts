import { describe, it, expect, vi } from 'vitest'

import {
  videoReadTools,
  projectVideoReadTools,
  executeVideoTool,
  executeVideoPropose,
  resolveVideoProposeAction,
  dispatchVideoConfirm,
  filterUsableAvProjects,
  type VideoReadRunner
} from '~~/server/utils/ai/mcp/videoTools'
import { buildVideoReadRunner } from '~~/server/utils/ai/mcp/videoRunner'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

// Deterministic RBAC: only 'admin' holds any permission (so only admin has CREATIVE).
// Mirrors test/ai/mcpGenerationTools.test.ts so the non-CREATIVE role is simply "any non-admin".
vi.mock('~~/server/utils/permissions', () => ({
  roleHasPermission: (role: string) => role === 'admin'
}))

const ctx = (role: string, userId = 'u1'): ToolContext => ({ userId, userRole: role, event: {} as never, source: 'mcp' })

const READ_NAMES = ['list_av_projects', 'list_video_models', 'list_video_generations', 'get_video_generation_status']

describe('projectVideoReadTools', () => {
  it('returns no tools when the suite flag is off', () => {
    expect(projectVideoReadTools('admin', false)).toEqual([])
  })

  it('returns the 4 read tools for a CREATIVE role when the flag is on', () => {
    expect(projectVideoReadTools('admin', true).map(t => t.name)).toEqual(READ_NAMES)
  })

  it('returns no tools for a role lacking CREATIVE', () => {
    expect(projectVideoReadTools('viewer', true)).toEqual([])
  })

  it('exposes exactly four read descriptors', () => {
    expect(videoReadTools.map(t => t.name)).toEqual(READ_NAMES)
  })
})

describe('filterUsableAvProjects', () => {
  const proj = (id: string, mediaType: string, createdBy: string) => ({ id, mediaType, createdBy } as never)

  it('keeps only av projects; admin/owner see all, others see own', () => {
    const all = [proj('a', 'av', 'u2'), proj('b', 'audio', 'u1'), proj('c', 'av', 'u1')]
    expect(filterUsableAvProjects(all, { id: 'u1', role: 'producer' }).map(p => p.id)).toEqual(['c'])
    expect(filterUsableAvProjects(all, { id: 'u1', role: 'admin' }).map(p => p.id)).toEqual(['a', 'c'])
    expect(filterUsableAvProjects(all, { id: 'u1', role: 'owner' }).map(p => p.id)).toEqual(['a', 'c'])
  })
})

describe('executeVideoTool guard (never throws)', () => {
  const runner = (): VideoReadRunner => ({ list_av_projects: vi.fn(async () => [{ id: 'a' }]) })

  it('disabled when the flag is off', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('admin'), { enabled: false, runner: runner() })
    expect(r).toMatchObject({ ok: false, code: 'disabled' })
  })

  it('not_found for an unknown tool', async () => {
    const r = await executeVideoTool('nope', {}, ctx('admin'), { enabled: true, runner: runner() })
    expect(r).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('forbidden for a role lacking CREATIVE', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('viewer'), { enabled: true, runner: runner() })
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('bad_args when args fail Zod', async () => {
    const r = await executeVideoTool('get_video_generation_status', { jobId: 'not-a-uuid' }, ctx('admin'), { enabled: true, runner: runner() })
    expect(r).toMatchObject({ ok: false, code: 'bad_args' })
  })

  it('handler_error when the runner throws', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('admin'), {
      enabled: true,
      runner: { list_av_projects: vi.fn(async () => { throw new Error('x') }) }
    })
    expect(r).toMatchObject({ ok: false, code: 'handler_error' })
  })

  it('ok passes runner data through', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('admin'), { enabled: true, runner: runner() })
    expect(r).toEqual({ ok: true, data: [{ id: 'a' }] })
  })
})

describe('buildVideoReadRunner', () => {
  it('registers a runner for each read tool', () => {
    const r = buildVideoReadRunner()
    expect(Object.keys(r).sort()).toEqual(READ_NAMES.slice().sort())
  })
})

const genArgs = {
  projectId: '11111111-1111-4111-8111-111111111111',
  mode: 'text-to-video',
  modelId: 'm1',
  prompt: 'a calm city street at dawn',
  durationSeconds: 5,
  aspectRatio: '16:9',
  subjectType: 'unknown'
}

const baseProposeDeps = () => ({
  suiteEnabled: true,
  genEnabled: true,
  resolveProject: vi.fn(async () => ({
    project: { mediaType: 'av', clientId: 'c1', createdBy: 'u1', currentTimelineId: 't1' },
    timeline: { id: 't1' }
  })),
  getModel: () => ({
    id: 'm1', provider: 'cf', modes: ['text-to-video'], durationsSeconds: [5],
    aspectRatios: ['16:9'], resolutions: [], allowedSubjectTypes: ['unknown'], requiresApprovedSourceAsset: false
  }),
  isTenantModel: () => true,
  loadSources: vi.fn(async () => []),
  loadPolicy: vi.fn(async () => ({ enabled: true, monthlyCapCents: 100000 })),
  evaluateCompliance: () => ({ allowed: true, classification: 'clear', reasons: [] as string[] }),
  estimateCost: () => 250,
  persist: vi.fn(async () => 'prop-123')
})

describe('resolveVideoProposeAction', () => {
  it('maps the two propose tools, null otherwise', () => {
    expect(resolveVideoProposeAction('propose_video_generation')).toBe('video_generation')
    expect(resolveVideoProposeAction('create_video_project')).toBe('video_project_create')
    expect(resolveVideoProposeAction('create_task')).toBeNull()
  })
})

describe('executeVideoPropose — video_generation', () => {
  it('disabled when the gen flag is off', async () => {
    const r = await executeVideoPropose('video_generation', genArgs, ctx('admin'), { ...baseProposeDeps(), genEnabled: false })
    expect(r).toMatchObject({ ok: false, code: 'disabled' })
  })
  it('forbidden for a non-CREATIVE role', async () => {
    const r = await executeVideoPropose('video_generation', genArgs, ctx('viewer'), baseProposeDeps())
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
  })
  it('forbidden when the project is not AV / not owned', async () => {
    const r = await executeVideoPropose('video_generation', genArgs, ctx('admin'), { ...baseProposeDeps(), resolveProject: vi.fn(async () => null) })
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
  })
  it('bad_args when the model rejects the params', async () => {
    const r = await executeVideoPropose('video_generation', { ...genArgs, durationSeconds: 999 }, ctx('admin'), baseProposeDeps())
    expect(r).toMatchObject({ ok: false, code: 'bad_args' })
  })
  it('blocked (no proposal persisted) when compliance disallows', async () => {
    const deps = { ...baseProposeDeps(), evaluateCompliance: () => ({ allowed: false, classification: 'prohibited', reasons: ['x'] }) }
    const r = await executeVideoPropose('video_generation', genArgs, ctx('admin'), deps)
    expect(r).toMatchObject({ ok: false, code: 'blocked' })
    expect(deps.persist).not.toHaveBeenCalled()
  })
  it('happy path persists and previews cost + classification', async () => {
    const r = await executeVideoPropose('video_generation', genArgs, ctx('admin'), baseProposeDeps())
    expect(r).toEqual({ ok: true, data: expect.objectContaining({ proposalId: 'prop-123', estimatedCostCents: 250, complianceClassification: 'clear' }) })
  })
})

describe('executeVideoPropose — video_project_create', () => {
  it('bad_args on empty title', async () => {
    const r = await executeVideoPropose('video_project_create', { title: '' }, ctx('admin'), baseProposeDeps())
    expect(r).toMatchObject({ ok: false, code: 'bad_args' })
  })
  it('happy path persists and returns a proposalId', async () => {
    const r = await executeVideoPropose('video_project_create', { title: 'New AV' }, ctx('admin'), baseProposeDeps())
    expect(r).toEqual({ ok: true, data: expect.objectContaining({ proposalId: 'prop-123', kind: 'video_project_create', title: 'New AV' }) })
  })
})

const genPayload = {
  tenantId: 'c1', projectId: 'p1', mode: 'text-to-video', modelId: 'm1', provider: 'cf', prompt: 'x',
  sourceAssetIds: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null, subjectType: 'unknown',
  complianceStatus: 'clear', complianceReasons: [], estimatedCostCents: 250, timelineId: 't1'
}

describe('dispatchVideoConfirm', () => {
  const okDeps = () => ({
    genEnabled: true,
    reserve: vi.fn(async () => ({ ok: true, reused: false, job: { id: 'job-1' } })),
    enqueue: vi.fn(async () => {}),
    createProject: vi.fn(async () => ({ projectId: 'newproj' }))
  })

  it('returns null for a non-video tool_name (2c falls through)', async () => {
    expect(await dispatchVideoConfirm({ tool_name: 'create_task', resolved_payload: {} }, ctx('admin'), okDeps())).toBeNull()
  })

  it('forbidden when gen flag is off', async () => {
    const r = await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: genPayload }, ctx('admin'), { ...okDeps(), genEnabled: false })
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('video_generation happy path reserves + enqueues once, returns jobId', async () => {
    const deps = okDeps()
    const r = await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: genPayload }, ctx('admin'), deps)
    expect(r).toEqual({ ok: true, data: { jobId: 'job-1', status: 'queued' } })
    expect(deps.enqueue).toHaveBeenCalledTimes(1)
  })

  it('cap_exceeded when reservation fails — no enqueue', async () => {
    const deps = { ...okDeps(), reserve: vi.fn(async () => ({ ok: false, reason: 'cap_exceeded', remainingCents: 100 })) }
    const r = await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: genPayload }, ctx('admin'), deps)
    expect(r).toMatchObject({ ok: false, code: 'cap_exceeded' })
    expect(deps.enqueue).not.toHaveBeenCalled()
  })

  it('reused reservation does not re-enqueue', async () => {
    const deps = { ...okDeps(), reserve: vi.fn(async () => ({ ok: true, reused: true, job: { id: 'job-1' } })) }
    const r = await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: genPayload }, ctx('admin'), deps)
    expect(r).toEqual({ ok: true, data: { jobId: 'job-1', status: 'queued' } })
    expect(deps.enqueue).not.toHaveBeenCalled()
  })

  it('video_project_create returns the new projectId', async () => {
    const r = await dispatchVideoConfirm({ tool_name: 'video_project_create', resolved_payload: { title: 'New', clientId: null } }, ctx('admin'), okDeps())
    expect(r).toEqual({ ok: true, data: { projectId: 'newproj' } })
  })

  it('handler_error when the executor throws', async () => {
    const deps = { ...okDeps(), reserve: vi.fn(async () => { throw new Error('boom') }) }
    const r = await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: genPayload }, ctx('admin'), deps)
    expect(r).toMatchObject({ ok: false, code: 'handler_error' })
  })
})
