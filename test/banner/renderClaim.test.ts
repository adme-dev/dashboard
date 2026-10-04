import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }))
vi.mock('pg', () => ({ default: { Client: class { connect = mocks.connect; query = mocks.query } } }))
const { dbMarkBannerRendering } = await import('~~/workers/audio-jobs/src/db')

describe('atomic banner render claim', () => {
  it('claims only queued/failed rows and rejects an already-owned or settled row', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'job' }] }).mockResolvedValueOnce({ rows: [] })
    expect(await dbMarkBannerRendering('job')).toBe(true)
    expect(await dbMarkBannerRendering('job')).toBe(false)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id=$1 AND status IN (\'queued\', \'failed\') RETURNING id'), ['job'])
  })
})
