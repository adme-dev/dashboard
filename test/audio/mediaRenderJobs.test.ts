import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryOneMock = vi.fn()
const queryRowsMock = vi.fn()
const transactionMock = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...a: any[]) => queryOneMock(...a),
  queryRows: (...a: any[]) => queryRowsMock(...a),
  transaction: (cb: any) => transactionMock(cb)
}))

import {
  mapRenderJobRow,
  createRenderJob,
  listRenderJobs,
  markRenderJobRendering,
  markRenderJobDone,
  markRenderJobFailed
} from '~~/server/utils/audio/projects'

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
      .mockResolvedValueOnce({ rows: [{ state: { schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0, tracks: [], ducking: [] }, max_version: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 't2', project_id: 'p1', version: 2, label: 'render', state: {}, schema_version: 1, created_by: 'u1', created_at: 'x' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [jobRow] })
    transactionMock.mockImplementation(async (cb: any) => cb({ query: dbQuery }))

    const job = await createRenderJob({ projectId: 'p1', requestedBy: 'u1', channels: ['radio', 'meta'] })
    expect(job.id).toBe('j1')
    expect(job.timelineId).toBe('t2')
    expect(job.status).toBe('queued')
    expect(dbQuery).toHaveBeenCalledTimes(4)
  })
})

describe('listRenderJobs', () => {
  it('lists a project\'s jobs newest-first', async () => {
    queryRowsMock.mockResolvedValueOnce([jobRow])
    const rows = await listRenderJobs('p1')
    expect(rows).toHaveLength(1)
    expect(queryRowsMock.mock.calls[0][0]).toContain('ORDER BY created_at DESC')
    expect(queryRowsMock.mock.calls[0][1]).toEqual(['p1'])
  })
})

describe('markRenderJob* status writers', () => {
  it('markRenderJobRendering flips status', async () => {
    queryOneMock.mockResolvedValueOnce({ ...jobRow, status: 'rendering' })
    const j = await markRenderJobRendering('j1')
    expect(j.status).toBe('rendering')
    expect(queryOneMock.mock.calls[0][0]).toContain("status = 'rendering'")
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
    transactionMock.mockImplementation(async (cb: any) => cb({ query: dbQuery }))
    await expect(createRenderJob({ projectId: 'nope', requestedBy: 'u1', channels: ['radio'] }))
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
