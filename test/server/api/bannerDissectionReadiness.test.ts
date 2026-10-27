import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), tx: vi.fn(), scope: vi.fn(), all: vi.fn(), pipeline: vi.fn() }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async (event: { body?: unknown }) => event.body)
vi.stubGlobal('getRouterParam', () => 'job')
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth, requireWriteAccess: m.auth }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.query, queryOneFresh: m.query, execute: m.execute, transaction: m.transaction }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: m.scope, hasAllSocialClientAccess: m.all }))
vi.mock('~~/server/utils/bannerDissectorPipeline', () => ({ runDissectionPipeline: m.pipeline }))
const { dissectionResultId } = await import('../../../server/utils/banner/dissectionJobs')
const get = (await import('../../../server/api/agency/banner-studio/dissect/[jobId].get')).default
const importJob = (await import('../../../server/api/agency/banner-studio/dissect/[jobId]/import.post')).default
const processJob = (await import('../../../server/api/agency/banner-studio/dissect/process.post')).default
const cancelJob = (await import('../../../server/api/agency/banner-studio/dissect/[jobId]/cancel.post')).default
const projectId = '11111111-1111-4111-8111-111111111111'
const revision = '2026-10-26T00:00:00.000Z'
const nextRevision = '2026-10-26T00:00:00.001Z'
const graphic = { id: 'graphic', type: 'graphic_text', description: 'Main headline', extraction_status: 'extracted', r2_url: 'https://asset.test/graphic.png', region: { x: 0, y: 0, width: 1, height: 1 }, z_index: 1 }
let job: { job_id: string, source_r2_key: string, status: string, manifest: Record<string, unknown>, project_id?: string } | null
let project: { id: string, created_by: string, client_id: string | null, canvas_data: Record<string, unknown>, updated_at: string }
let projectWrites: number, receiptWrites: number
beforeEach(() => {
  vi.resetAllMocks()
  m.auth.mockResolvedValue({ id: 'user' })
  m.all.mockReturnValue(true)
  job = { job_id: 'job', source_r2_key: 'banner-dissector/job/original.png', status: 'complete', manifest: { status: 'complete', tokens: {}, layers: [graphic] } }
  project = { id: projectId, created_by: 'user', client_id: null, canvas_data: {}, updated_at: revision }
  projectWrites = receiptWrites = 0
  m.query.mockImplementation(async sql => sql.startsWith('UPDATE') ? null : structuredClone(job))
  // Deterministic local transaction double; not evidence of real DB concurrency.
  m.transaction.mockImplementation(async (callback) => {
    const before = structuredClone({ job, project, projectWrites, receiptWrites })
    try {
      return await callback({ query: m.tx })
    } catch (error) {
      ;({ job, project, projectWrites, receiptWrites } = before)
      throw error
    }
  })
  m.tx.mockImplementation(async (sql: string, args: string[]) => {
    if (sql.includes('SELECT') && sql.includes('FROM banner_dissections')) return { rows: job ? [structuredClone(job)] : [] }
    if (sql.includes('SELECT') && sql.includes('FROM banner_projects')) return { rows: project ? [structuredClone(project)] : [] }
    if (sql.includes('UPDATE banner_projects')) {
      if (new Date(project.updated_at).getTime() !== Date.parse(args[2])) return { rows: [] }
      projectWrites++
      project.canvas_data = JSON.parse(args[0])
      project.updated_at = nextRevision
      return { rows: [{ id: projectId, updated_at: nextRevision }] }
    }
    if (sql.includes('INSERT INTO banner_projects')) {
      projectWrites++
      return { rows: [{ id: projectId, updated_at: nextRevision }] }
    }
    if (sql.includes('UPDATE banner_dissections')) {
      receiptWrites++
      job.project_id = args[0]
      job.manifest = JSON.parse(args[1])
      job.status = 'imported'
      return { rows: [{ job_id: 'job' }] }
    }
    throw new Error(`Unexpected local SQL: ${sql}`)
  })
})
const resultId = () => dissectionResultId((job?.manifest || {}) as never)
const newTarget = () => importJob({ body: { expectedResultId: resultId() } } as never)
const existing = (extra = {}) => importJob({ body: { projectId, expectedRevision: revision, expectedResultId: resultId(), ...extra } } as never)

describe('Dissection owner, review and atomic import boundary (local mocked DB)', () => {
  it('returns review findings with authoritative identity and progress', async () => {
    job.status = 'review_ready'
    job.manifest = { status: 'complete', jobId: 'spoof', layers: [], warnings: ['Background needs reconstruction'], execution: { attemptId: 'a', completed: 2, total: 2 } }
    expect(await get({} as never)).toMatchObject({ jobId: 'job', status: 'review_ready', warnings: ['Background needs reconstruction'], progress: { stage: 'review_ready', completed: 2, total: 2 } })
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), ['job', 'user'])
  })
  it.each(['review_ready', 'complete'])('blocks %s manifests without verified extraction', async (status) => {
    job.status = status
    job.manifest = { status, layers: [{ type: 'background', r2_url: 'original.png' }] }
    await expect(newTarget()).rejects.toMatchObject({ statusCode: 409 })
    expect(projectWrites).toBe(0)
  })
  it('requires the revision reviewed by the caller', async () => {
    await expect(importJob({ body: { projectId, expectedResultId: resultId() } } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(projectWrites).toBe(0)
  })
  it('rejects a concurrent project edit without receipt persistence', async () => {
    project.updated_at = nextRevision
    await expect(existing()).rejects.toMatchObject({ statusCode: 409 })
    expect(projectWrites).toBe(0)
    expect(receiptWrites).toBe(0)
  })
  it('protects managed QR codes', async () => {
    project.canvas_data = { mrec: { layers: [{ id: 7, platformQr: { qrCodeId: 'managed' } }] } }
    await expect(existing()).rejects.toMatchObject({ statusCode: 409 })
    expect(projectWrites).toBe(0)
  })
  it('imports once and replays the original receipt even after later edits', async () => {
    const result = await existing()
    expect(result.layers[0]).toMatchObject({ type: 'image', src: graphic.r2_url })
    expect(result).toMatchObject({ projectId, formatKey: 'mrec', revision: nextRevision, receiptId: expect.any(String) })
    project.updated_at = '2026-10-27T00:00:00.000Z'
    expect(await existing()).toEqual(result)
    expect(projectWrites).toBe(1)
    expect(receiptWrites).toBe(1)
    expect(m.tx.mock.calls[0][0]).toContain('FOR UPDATE')
  })
  it('rejects changed intent after import', async () => {
    await existing()
    await expect(existing({ formatKey: 'leader' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(existing({ expectedRevision: nextRevision })).rejects.toMatchObject({ statusCode: 409 })
    expect(projectWrites).toBe(1)
  })
  it('creates only one project on repeated new-target import', async () => {
    const first = await newTarget()
    expect(await newTarget()).toEqual(first)
    expect(projectWrites).toBe(1)
  })
  it('rechecks target client access on receipt replay', async () => {
    await existing()
    project.client_id = 'client'
    m.scope.mockRejectedValue({ statusCode: 403 })
    await expect(existing()).rejects.toMatchObject({ statusCode: 403 })
    expect(projectWrites).toBe(1)
  })
  it('rechecks job ownership and source scope before import', async () => {
    job.source_r2_key = 'banner-dissector/other/original.png'
    await expect(existing()).rejects.toMatchObject({ statusCode: 409 })
    job = null
    await expect(existing()).rejects.toMatchObject({ statusCode: 404 })
    expect(projectWrites).toBe(0)
  })
  it('refuses invented copy and unsupported visual conversions', async () => {
    for (const type of ['text', 'rect', 'bg']) await expect(existing({ layerTypeOverrides: { graphic: type } })).rejects.toMatchObject({ statusCode: 409 })
    expect(projectWrites).toBe(0)
  })
  it('rejects prototype names as target formats before any project mutation', async () => {
    await expect(existing({ formatKey: 'toString' })).rejects.toMatchObject({ statusCode: 400 })
    expect(projectWrites).toBe(0)
  })
  it('rejects an extraction result replaced since review', async () => {
    const reviewed = resultId()
    job.manifest.tokens = { t: { value: 'changed after review' } }
    await expect(existing({ expectedResultId: reviewed })).rejects.toMatchObject({ statusCode: 409 })
    expect(projectWrites).toBe(0)
  })
  it('allows owner native text import and blocks another user unassigned target', async () => {
    job.manifest = { status: 'complete', tokens: { t: { value: 'Hello' } }, layers: [{ ...graphic, type: 'live_text', token_bindings: ['t'] }] }
    m.all.mockReturnValue(false)
    project.created_by = 'other'
    await expect(existing()).rejects.toMatchObject({ statusCode: 403 })
    project.created_by = 'user'
    expect((await existing()).layers[0]).toMatchObject({ type: 'text', text: 'Hello' })
    expect(m.scope).not.toHaveBeenCalled()
  })
  it('rolls back project mutation if receipt persistence fails', async () => {
    const impl = m.tx.getMockImplementation()!
    m.tx.mockImplementation(async (sql, args) => {
      if (sql.includes('UPDATE banner_dissections')) throw new Error('local injected receipt failure')
      return await impl(sql, args)
    })
    await expect(existing()).rejects.toThrow('local injected receipt failure')
    expect(project.canvas_data).toEqual({})
    expect(job.status).toBe('complete')
    expect(projectWrites).toBe(0)
  })
  it.each([get, processJob, cancelJob])('owner isolation on read/process/cancel', async (handler) => {
    m.query.mockResolvedValue(null)
    await expect(handler({ body: { jobId: 'job' } } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it('requires the reviewed generation for retry and never runs the pipeline in the request', async () => {
    await expect(processJob({ body: { jobId: 'job', retry: true } } as never)).rejects.toMatchObject({ statusCode: 400 })
    await expect(processJob({ body: { jobId: 'job', retry: 'yes' } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it('cancellation is idempotent and refuses imported artwork', async () => {
    job.status = 'cancelled'
    expect(await cancelJob({} as never)).toMatchObject({ status: 'cancelled' })
    expect(await cancelJob({} as never)).toMatchObject({ status: 'cancelled' })
    job.status = 'imported'
    await expect(cancelJob({} as never)).rejects.toMatchObject({ statusCode: 409 })
  })
})
