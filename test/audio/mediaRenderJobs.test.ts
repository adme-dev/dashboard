import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mapRenderJobRow,
  createRenderJob,
  listRenderJobs,
  markRenderJobRendering,
  markRenderJobDone,
  markRenderJobFailed
} from '~~/server/utils/audio/projects'

type TestTransaction = (db: { query: ReturnType<typeof vi.fn> }) => unknown

const queryOneMock = vi.fn()
const queryRowsMock = vi.fn()
const queryRowsFreshMock = vi.fn()
const transactionMock = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...a: unknown[]) => queryOneMock(...a),
  queryRows: (...a: unknown[]) => queryRowsMock(...a),
  queryRowsFresh: (...a: unknown[]) => queryRowsFreshMock(...a),
  transaction: (cb: TestTransaction) => transactionMock(cb)
}))

const jobRow = {
  id: 'j1', timeline_id: 't2', project_id: 'p1', channels: ['radio', 'meta'],
  status: 'queued', variants: {}, cost_cents: null, error: null, requested_by: 'u1',
  created_at: '2026-06-02T00:00:00Z', updated_at: '2026-06-02T00:00:00Z'
}

beforeEach(() => vi.clearAllMocks())

describe('mapRenderJobRow', () => {
  it('maps snake_case → camelCase incl. channels + variants + costCents', () => {
    const j = mapRenderJobRow(jobRow)
    expect(j.id).toBe('j1')
    expect(j.timelineId).toBe('t2')
    expect(j.projectId).toBe('p1')
    expect(j.channels).toEqual(['radio', 'meta'])
    expect(j.status).toBe('queued')
    expect(j.variants).toEqual({})
    expect(j.costCents).toBeNull()
  })
})

describe('createRenderJob', () => {
  it('snapshots a new version then inserts a queued job pointing at it (one transaction)', async () => {
    const dbQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'p1', created_by: 'u1', current_timeline_id: 't1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', edit_revision: 0, state: { schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0, tracks: [], ducking: [] }, schema_version: 1 }] })
      .mockResolvedValueOnce({ rows: [{ max_version: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 't2', project_id: 'p1', version: 2, label: 'render', state: {}, schema_version: 1, created_by: 'u1', created_at: 'x' }] })
      .mockResolvedValueOnce({ rows: [jobRow] })
      .mockResolvedValueOnce({ rows: [] }) // Legacy timeline has no storyboard obligations.
    transactionMock.mockImplementation(async (cb: TestTransaction) => cb({ query: dbQuery }))

    const job = await createRenderJob({ projectId: 'p1', actor: { id: 'u1', role: 'member' }, expectedTimelineId: 't1', expectedEditRevision: 0, channels: ['radio', 'meta'] })
    expect(job.id).toBe('j1')
    expect(job.timelineId).toBe('t2')
    expect(job.status).toBe('queued')
    expect(dbQuery).toHaveBeenCalledTimes(6)
    expect(dbQuery.mock.calls[5][0]).toContain('FROM video_storyboard_timeline_obligations')
    expect(dbQuery.mock.calls[5][1]).toEqual(['p1', 't1', 0])
    // schema_version from source row must be forwarded (not hardcoded 1)
    const insertCall = dbQuery.mock.calls[3]
    expect(insertCall[0]).toContain('INSERT INTO media_timelines')
    // schema_version follows id, project, version, label, state.
    expect(insertCall[1][5]).toBe(1)
  })

  it('preserves schema_version=2 from the source AV timeline (not hardcoded 1)', async () => {
    const dbQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'p1', created_by: 'u1', current_timeline_id: 't1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', edit_revision: 0, state: { schema_version: 2, media_type: 'av', tracks: [], ducking: [] }, schema_version: 2 }] })
      .mockResolvedValueOnce({ rows: [{ max_version: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'tnew', schema_version: 2, edit_revision: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ...jobRow, id: 'j2', timeline_id: 'tnew' }] })
      .mockResolvedValueOnce({ rows: [] }) // Legacy AV timeline has no storyboard obligations.
    transactionMock.mockImplementation(async (cb: TestTransaction) => cb({ query: dbQuery }))

    await createRenderJob({ projectId: 'p1', actor: { id: 'u1', role: 'member' }, expectedTimelineId: 't1', expectedEditRevision: 0, channels: [] })
    const insertCall = dbQuery.mock.calls[3]
    expect(insertCall[0]).toContain('INSERT INTO media_timelines')
    // schema_version param (index 5) must be 2, not 1
    expect(insertCall[1][5]).toBe(2)
  })
})

describe('listRenderJobs', () => {
  it('lists a project\'s jobs newest-first', async () => {
    queryRowsFreshMock.mockResolvedValueOnce([jobRow])
    const rows = await listRenderJobs('p1')
    expect(rows).toHaveLength(1)
    expect(queryRowsMock).not.toHaveBeenCalled()
    expect(queryRowsFreshMock.mock.calls[0][0]).toContain('ORDER BY created_at DESC')
    expect(queryRowsFreshMock.mock.calls[0][1]).toEqual(['p1'])
  })
})

describe('markRenderJob* status writers', () => {
  it('markRenderJobRendering flips status', async () => {
    queryOneMock.mockResolvedValueOnce({ ...jobRow, status: 'rendering' })
    const j = await markRenderJobRendering('j1')
    expect(j.status).toBe('rendering')
    expect(queryOneMock.mock.calls[0][0]).toContain('status = \'rendering\'')
  })
  it('markRenderJobDone writes variants + costCents + status done', async () => {
    queryOneMock.mockResolvedValueOnce({ ...jobRow, status: 'done', variants: { radio: 'k/r' }, cost_cents: 12 })
    const j = await markRenderJobDone('j1', { radio: 'k/r' }, 12)
    expect(j.status).toBe('done')
    expect(j.variants).toEqual({ radio: 'k/r' })
    expect(j.costCents).toBe(12)
    const params = queryOneMock.mock.calls[0][1]
    expect(JSON.parse(params[0])).toEqual({ radio: 'k/r' })
    expect(params[1]).toBe(12)
  })
  it('markRenderJobFailed writes status failed + error', async () => {
    queryOneMock.mockResolvedValueOnce({ ...jobRow, status: 'failed', error: 'boom' })
    const j = await markRenderJobFailed('j1', 'boom')
    expect(j.status).toBe('failed')
    expect(j.error).toBe('boom')
  })
})

describe('render-job throw paths', () => {
  it('createRenderJob throws when the project has no current timeline', async () => {
    const dbQuery = vi.fn().mockResolvedValueOnce({ rows: [] }) // SELECT returns nothing
    transactionMock.mockImplementation(async (cb: TestTransaction) => cb({ query: dbQuery }))
    await expect(createRenderJob({ projectId: 'nope', actor: { id: 'u1', role: 'member' }, expectedTimelineId: 't1', expectedEditRevision: 0, channels: ['radio'] }))
      .rejects.toThrow()
  })
  it('markRenderJobRendering throws when the job is missing', async () => {
    queryOneMock.mockResolvedValueOnce(null)
    await expect(markRenderJobRendering('missing')).rejects.toThrow()
  })
  it('markRenderJobDone throws when the job is missing', async () => {
    queryOneMock.mockResolvedValueOnce(null)
    await expect(markRenderJobDone('missing', { radio: 'k' }, 5)).rejects.toThrow()
  })
  it('markRenderJobFailed throws when the job is missing', async () => {
    queryOneMock.mockResolvedValueOnce(null)
    await expect(markRenderJobFailed('missing', 'boom')).rejects.toThrow()
  })
})
