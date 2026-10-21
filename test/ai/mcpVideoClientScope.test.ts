import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildVideoReadRunner, buildVideoProposeDeps, buildVideoConfirmDeps } from '~~/server/utils/ai/mcp/videoRunner'
import { executeVideoTool, executeVideoPropose, dispatchVideoConfirm, type VideoGenerationPendingPayload } from '~~/server/utils/ai/mcp/videoTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const edges = vi.hoisted(() => ({ rows: vi.fn(), one: vi.fn(), transaction: vi.fn(), persist: vi.fn(), reserve: vi.fn(), enqueue: vi.fn(), promote: vi.fn(), creative: vi.fn(), urls: vi.fn(), dispatched: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryRows: edges.rows, queryOne: edges.one, transaction: edges.transaction }))
vi.mock('~~/server/utils/ai/pendingActions', () => ({ proposeAction: edges.persist }))
vi.mock('~~/server/utils/video-generation/budget', () => ({ reserveAndCreateVideoGenerationJob: edges.reserve }))
vi.mock('~~/server/utils/video-generation/enqueue', () => ({ enqueueVideoGeneration: edges.enqueue }))
vi.mock('~~/server/utils/video-generation/promoteCreativeAsset', () => ({ promoteCreativeAssetToVideoSource: edges.promote }))
vi.mock('~~/server/utils/ai/tools/creativeAssets', () => ({ findCreativeAssetById: edges.creative }))
vi.mock('~~/server/utils/video-generation/resolveSourceUrls', () => ({ resolveSourceAssetUrls: edges.urls }))
vi.mock('~~/server/utils/video-generation/policy', () => ({ loadTenantVideoGenerationPolicy: async () => ({ enabled: true, monthlyCapCents: 100000 }) }))
// Enable the real text-to-video model for synthetic acceptance; production availability is unrelated to scope.
vi.mock('~~/server/utils/video-generation/modelRegistry', async (original) => {
  const registry = await original<typeof import('~~/server/utils/video-generation/modelRegistry')>()
  return { ...registry, getVideoGenerationModel: (modelId: string) => {
    const model = registry.getVideoGenerationModel(modelId)
    return model ? { ...model, defaultEnabled: true } : model
  } }
})

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLIENT = id(1)
const FOREIGN = id(2)
const OWN = id(10)
const OTHER = id(11)
const AGENCY = id(12)
const OWN_JOB = id(20)
const OTHER_JOB = id(21)
const AGENCY_JOB = id(22)
const OWN_SOURCE = id(30)
const OTHER_SOURCE = id(31)
const AGENCY_SOURCE = id(32)
let db: PGlite
function context(role = 'creative', scope: unknown = CLIENT): ToolContext {
  return { userId: 'synthetic-creator', userRole: role, clientScope: scope, source: 'mcp', event: { context: {} } } as ToolContext
}
function unscoped(role = 'creative'): ToolContext {
  const ctx = context(role)
  delete ctx.clientScope
  return ctx
}
function read(name: string, args: unknown, ctx = context()) {
  return executeVideoTool(name, args, ctx, { enabled: true, runner: buildVideoReadRunner() })
}
function propose(action: Parameters<typeof executeVideoPropose>[0], args: unknown, ctx = context()) {
  return executeVideoPropose(action, args, ctx, { suiteEnabled: true, genEnabled: true, ...buildVideoProposeDeps() })
}
function confirm(action: string, payload: unknown, ctx = context()) {
  return dispatchVideoConfirm({ tool_name: action, resolved_payload: payload }, ctx, {
    genEnabled: true, ...buildVideoConfirmDeps(), execution: { markDispatched: edges.dispatched } as never
  })
}
function generation(overrides: Partial<VideoGenerationPendingPayload> = {}): VideoGenerationPendingPayload {
  return { tenantId: CLIENT, projectId: OWN, timelineId: null, mode: 'text-to-video', modelId: 'aigateway/veo-t2v', provider: 'aigateway', prompt: 'A calm sunrise over the ocean', sourceAssetIds: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null, subjectType: 'non_vehicle', complianceStatus: 'non_vehicle_t2v', complianceReasons: [], estimatedCostCents: 250, idempotencyKey: 'mcp:synthetic', ...overrides }
}
function promotion(overrides: Record<string, unknown> = {}) {
  return { assetId: 'synthetic-creative', projectId: OWN, tenantId: CLIENT, subjectType: 'non_vehicle', expectedSourceSystem: 'banner_studio', expectedSourceAssetRef: 'synthetic-creative', ...overrides }
}
async function project(projectId: string, clientId: string | null, updated = '2026-10-01T00:00:00Z') {
  await db.query(`INSERT INTO media_projects(id,client_id,created_by,title,media_type,status,updated_at) VALUES($1,$2,'synthetic-creator','Synthetic project','av','draft',$3)`, [projectId, clientId, updated])
}
function expectNoEffects() {
  expect(edges.reserve).not.toHaveBeenCalled()
  expect(edges.enqueue).not.toHaveBeenCalled()
  expect(edges.promote).not.toHaveBeenCalled()
  expect(edges.transaction).not.toHaveBeenCalled()
  expect(edges.dispatched).not.toHaveBeenCalled()
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE media_projects(id uuid PRIMARY KEY,client_id uuid,created_by text,title text,media_type text,status text,is_test boolean,current_timeline_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE media_timelines(id uuid PRIMARY KEY,project_id uuid,version int,label text,state jsonb,schema_version int,created_by text,created_at timestamptz DEFAULT now());
    CREATE TABLE media_render_jobs(id uuid,project_id uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE video_generation_jobs(id uuid PRIMARY KEY,tenant_id text,project_id uuid,status text,mode text,model_id text,estimated_cost_cents int,actual_cost_cents int,provider_result_url text,created_at timestamptz DEFAULT now());
    CREATE TABLE video_gen_source_assets(id uuid PRIMARY KEY,client_id uuid,r2_key text,status text,content_type text,subject_type text,original_filename text,width int,height int,created_at timestamptz DEFAULT now(),source_system text,source_asset_ref text,source_metadata jsonb);
  `)
  edges.rows.mockImplementation(async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows)
  edges.one.mockImplementation(async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] ?? null)
  edges.transaction.mockImplementation(async (callback: (connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<unknown>) => callback({ query: (sql, params = []) => db.query(sql, params) }))
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  vi.clearAllMocks()
  await db.exec('TRUNCATE media_projects,media_timelines,media_render_jobs,video_generation_jobs,video_gen_source_assets')
  await project(OWN, CLIENT)
  await project(OTHER, FOREIGN, '2026-10-02T00:00:00Z')
  await project(AGENCY, null, '2026-10-03T00:00:00Z')
  for (const [jobId, projectId, tenant] of [[OWN_JOB, OWN, CLIENT], [OTHER_JOB, OTHER, FOREIGN], [AGENCY_JOB, AGENCY, 'agency']]) {
    await db.query(`INSERT INTO video_generation_jobs(id,project_id,tenant_id,status,mode,model_id,estimated_cost_cents,provider_result_url) VALUES($1,$2,$3,'succeeded','text-to-video','aigateway/veo-t2v',250,'https://synthetic.invalid/video.mp4')`, [jobId, projectId, tenant])
  }
  for (const [assetId, clientId] of [[OWN_SOURCE, CLIENT], [OTHER_SOURCE, FOREIGN], [AGENCY_SOURCE, null]]) {
    await db.query(`INSERT INTO video_gen_source_assets(id,client_id,r2_key,status,subject_type) VALUES($1,$2,'synthetic.png','approved','non_vehicle')`, [assetId, clientId])
  }
  edges.persist.mockResolvedValue(id(99))
  edges.reserve.mockResolvedValue({ ok: true, reused: false, job: { id: id(98) } })
  edges.enqueue.mockResolvedValue(undefined)
  edges.promote.mockResolvedValue({ sourceAssetId: OWN_SOURCE, status: 'pending', sourceSystem: 'banner_studio', sourceAssetRef: 'synthetic-creative' })
  edges.creative.mockResolvedValue({ assetId: 'synthetic-creative', source: 'banner_studio', assetUrl: 'https://synthetic.invalid/creative.png', clientIds: [CLIENT], filename: 'synthetic.png' })
  edges.urls.mockResolvedValue(['https://synthetic.invalid/source.png'])
})

describe.each(['creative', 'owner'])('video client scope for %s', (role) => {
  it('filters project SQL before the 200-project cap', async () => {
    for (let n = 0; n < 201; n++) await project(id(1000 + n), FOREIGN, '2026-10-20T00:00:00Z')
    expect(await read('list_av_projects', {}, context(role))).toMatchObject({ ok: true, data: [{ id: OWN }] })
  })
  it('lists only jobs in scoped projects', async () => {
    expect(await read('list_video_generations', {}, context(role))).toMatchObject({ ok: true, data: [{ jobId: OWN_JOB }] })
  })
  it.each([OTHER, AGENCY])('denies foreign or agency project reads %s', async (projectId) => {
    for (const tool of ['list_video_models', 'list_video_generations', 'list_video_source_assets', 'get_timeline_context']) {
      expect(await read(tool, { projectId }, context(role))).toMatchObject({ ok: false })
    }
    expect(await buildVideoProposeDeps().resolveProject(projectId, context(role))).toBeNull()
  })
  it.each([OTHER_JOB, AGENCY_JOB])('denies foreign or agency generation status %s', async (jobId) => {
    expect(await read('get_video_generation_status', { jobId }, context(role))).toMatchObject({ ok: false })
  })
  it('permits own reads and preserves agency-wide unscoped access', async () => {
    expect(await read('get_timeline_context', { projectId: OWN }, context(role))).toMatchObject({ ok: true, data: { project: { id: OWN } } })
    expect(await read('get_video_generation_status', { jobId: OWN_JOB }, context(role))).toMatchObject({ ok: true, data: { jobId: OWN_JOB } })
    const result = await read('list_av_projects', {}, unscoped(role))
    expect(result.ok).toBe(true)
    expect((result as { data: Array<{ id: string }> }).data.map(p => p.id).sort()).toEqual([OWN, OTHER, AGENCY].sort())
    expect(await read('get_timeline_context', { projectId: AGENCY }, unscoped(role))).toMatchObject({ ok: true })
  })
})

it.each(['', 'not-a-uuid', null, 42])('fails closed for invalid supplied scope %s', async (scope) => {
  expect(await read('list_av_projects', {}, context('owner', scope))).toMatchObject({ ok: false })
  expect(await propose('video_project_create', { title: 'Synthetic' }, context('owner', scope))).toMatchObject({ ok: false })
  expect(await confirm('video_generation', generation(), context('owner', scope))).toMatchObject({ ok: false })
  expectNoEffects()
  expect(edges.persist).not.toHaveBeenCalled()
})

it('binds omitted create-project clientId to the server-resolved scope', async () => {
  expect(await propose('video_project_create', { title: 'Synthetic' })).toMatchObject({ ok: true })
  expect(edges.persist).toHaveBeenCalledWith(expect.anything(), null, 'video_project_create', { title: 'Synthetic', clientId: CLIENT })
})
it.each([FOREIGN, null])('rejects create-project proposal requesting %s outside the scope', async (clientId) => {
  expect(await propose('video_project_create', { title: 'Synthetic', clientId })).toMatchObject({ ok: false })
  expect(edges.persist).not.toHaveBeenCalled()
})
it('preserves unscoped project creation with no client', async () => {
  expect(await propose('video_project_create', { title: 'Synthetic' }, unscoped())).toMatchObject({ ok: true })
  expect(await confirm('video_project_create', { title: 'Synthetic', clientId: null }, unscoped())).toMatchObject({ ok: true })
  expect((await db.query(`SELECT client_id FROM media_projects WHERE title='Synthetic'`)).rows).toEqual([{ client_id: null }])
})
it('creates correctly scoped projects', async () => {
  expect(await confirm('video_project_create', { title: 'Synthetic', clientId: CLIENT })).toMatchObject({ ok: true })
  expect((await db.query(`SELECT client_id FROM media_projects WHERE title='Synthetic'`)).rows).toEqual([{ client_id: CLIENT }])
})
it.each([FOREIGN, null])('rejects persisted project-create payload for %s before dispatch or creation', async (clientId) => {
  expect(await confirm('video_project_create', { title: 'Synthetic', clientId })).toMatchObject({ ok: false })
  expectNoEffects()
})
it.each([OTHER, AGENCY])('rejects generation confirm for foreign or agency project %s before spend', async (projectId) => {
  expect(await confirm('video_generation', generation({ projectId }))).toMatchObject({ ok: false })
  expectNoEffects()
})
it('rejects forged tenant on an otherwise usable project', async () => {
  expect(await confirm('video_generation', generation({ tenantId: FOREIGN }))).toMatchObject({ ok: false })
  expectNoEffects()
})
it('rechecks project client after proposal and before spending', async () => {
  expect(await propose('video_generation', generation())).toMatchObject({ ok: true })
  await db.query('UPDATE media_projects SET client_id=$1 WHERE id=$2', [FOREIGN, OWN])
  expect(await confirm('video_generation', generation())).toMatchObject({ ok: false })
  expectNoEffects()
})
it('does not expose old tenant job status after its project is reassigned', async () => {
  await db.query('UPDATE media_projects SET client_id=$1 WHERE id=$2', [CLIENT, OTHER])
  expect(await read('get_video_generation_status', { jobId: OTHER_JOB })).toMatchObject({ ok: false })
})
it('permits own generation reserve and dispatch', async () => {
  expect(await confirm('video_generation', generation())).toMatchObject({ ok: true })
  expect(edges.reserve).toHaveBeenCalledTimes(1)
  expect(edges.enqueue).toHaveBeenCalledTimes(1)
  expect(edges.dispatched).toHaveBeenCalledTimes(1)
})
it('excludes unbound shared assets from a scoped source listing but preserves agency behavior', async () => {
  expect(await read('list_video_source_assets', { projectId: OWN })).toMatchObject({ ok: true, data: [{ assetId: OWN_SOURCE }] })
  expect(await read('list_video_source_assets', { projectId: AGENCY }, unscoped())).toMatchObject({ ok: true, data: [{ assetId: AGENCY_SOURCE }] })
})
it.each([OTHER_SOURCE, AGENCY_SOURCE])('rejects out-of-scope source %s in text-to-video proposal and confirm', async (assetId) => {
  expect(await propose('video_generation', generation({ sourceAssetIds: [assetId] }))).toMatchObject({ ok: false })
  expect(edges.persist).not.toHaveBeenCalled()
  expect(await confirm('video_generation', generation({ sourceAssetIds: [assetId] }))).toMatchObject({ ok: false })
  expectNoEffects()
})
it.each([OTHER_SOURCE, AGENCY_SOURCE])('rejects out-of-scope source %s in image-to-video proposal', async (assetId) => {
  expect(await propose('video_generation', generation({ mode: 'image-to-video', modelId: 'aigateway/seedance-i2v', sourceAssetIds: [assetId] }))).toMatchObject({ ok: false })
  expect(edges.persist).not.toHaveBeenCalled()
})
it.each([{ clientIds: [] }, { clientIds: [FOREIGN] }])('requires explicit matching creative-asset binding $clientIds', async ({ clientIds }) => {
  edges.creative.mockResolvedValue({ assetId: 'synthetic-creative', source: 'banner_studio', assetUrl: 'https://synthetic.invalid/creative.png', clientIds, filename: 'synthetic.png' })
  expect(await propose('video_source_promote', promotion())).toMatchObject({ ok: false })
  expect(edges.persist).not.toHaveBeenCalled()
  expect(await confirm('video_source_promote', promotion())).toMatchObject({ ok: false })
  expectNoEffects()
})
it('rechecks source promotion binding after proposal', async () => {
  expect(await propose('video_source_promote', promotion())).toMatchObject({ ok: true })
  edges.creative.mockResolvedValue({ assetId: 'synthetic-creative', source: 'banner_studio', assetUrl: 'https://synthetic.invalid/creative.png', clientIds: [FOREIGN], filename: 'synthetic.png' })
  expect(await confirm('video_source_promote', promotion())).toMatchObject({ ok: false })
  expectNoEffects()
})
it.each([{ projectId: OTHER }, { tenantId: FOREIGN }])('rejects tampered source promotion payload %j before dispatch', async (override) => {
  expect(await confirm('video_source_promote', promotion(override))).toMatchObject({ ok: false })
  expectNoEffects()
})
it('allows explicitly bound creative promotion and legacy agency unbound assets', async () => {
  expect(await propose('video_source_promote', promotion())).toMatchObject({ ok: true })
  expect(await confirm('video_source_promote', promotion())).toMatchObject({ ok: true })
  edges.creative.mockResolvedValue({ assetId: 'synthetic-creative', source: 'banner_studio', assetUrl: 'https://synthetic.invalid/creative.png', clientIds: [], filename: 'synthetic.png' })
  expect(await propose('video_source_promote', promotion({ projectId: AGENCY }), unscoped())).toMatchObject({ ok: true })
})

it('refuses scoped confirmation when its dependency adapter has no authorization preflight', async () => {
  const deps = { genEnabled: true, ...buildVideoConfirmDeps() }
  Reflect.deleteProperty(deps, 'authorize')
  expect(await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: generation() }, context(), deps)).toMatchObject({ ok: false })
  expectNoEffects()
})
it('preserves unscoped confirmation through the legacy dependency adapter', async () => {
  const deps = { genEnabled: true, ...buildVideoConfirmDeps() }
  Reflect.deleteProperty(deps, 'authorize')
  expect(await dispatchVideoConfirm({ tool_name: 'video_generation', resolved_payload: generation() }, unscoped(), deps)).toMatchObject({ ok: true })
  expect(edges.reserve).toHaveBeenCalledTimes(1)
})
it('keeps a scoped creator denied another employee project in the same client', async () => {
  await db.query('UPDATE media_projects SET created_by=$1 WHERE id=$2', ['another-employee', OWN])
  expect(await read('get_timeline_context', { projectId: OWN })).toMatchObject({ ok: false })
  expect(await confirm('video_generation', generation())).toMatchObject({ ok: false })
  expectNoEffects()
})
