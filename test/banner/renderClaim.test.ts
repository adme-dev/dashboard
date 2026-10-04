import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }))
const workerRequire = createRequire(new URL('../../workers/audio-jobs/package.json', import.meta.url))
const pgPackage = workerRequire.resolve('pg/package.json')
const pgMetadata = JSON.parse(readFileSync(pgPackage, 'utf8'))
const pgEntry = resolve(dirname(pgPackage), pgMetadata.exports?.['.']?.import || pgMetadata.main || 'lib/index.js')
vi.doMock(pgEntry, () => ({ default: { Client: class { connect = mocks.connect; query = mocks.query } } }))
const { dbMarkBannerRendering, dbRenewBannerLease, dbMarkBannerDone, dbMarkBannerFailed } = await import('~~/workers/audio-jobs/src/db')

describe('fenced durable banner lease', () => {
  it('claims queued/failed or expired rendering rows with a precision-preserving token', async () => {
    const token = '2026-10-04 12:00:00.123456+00'
    mocks.query.mockResolvedValueOnce({ rows: [{ token }] }).mockResolvedValueOnce({ rows: [] })
    expect(await dbMarkBannerRendering('job')).toBe(token)
    expect(await dbMarkBannerRendering('job')).toBe(null)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('status=\'rendering\' AND updated_at <= now() - interval \'15 minutes\''), ['job'])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('started_at::text AS token'), ['job'])
  })
  it('renews only a current, unexpired token', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'job' }] }).mockResolvedValueOnce({ rows: [] })
    expect(await dbRenewBannerLease('job', 'current')).toBe(true)
    expect(await dbRenewBannerLease('job', 'old')).toBe(false)
    expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('started_at=$2::timestamptz'), ['job', 'old'])
  })
  it('locks ownership and commits export plus job in one fenced statement; stale results insert nothing', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] })
    expect(await dbMarkBannerDone('job', 'old', { r2Key: 'attempt', url: '/video', size: 3 })).toBe(false)
    const [sql, values] = mocks.query.mock.calls.at(-1)!
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('started_at=$2::timestamptz')
    expect(sql).toContain('updated_at > now() - interval \'15 minutes\'')
    expect(sql).toContain('FROM owned RETURNING id')
    expect(sql).toContain('FROM owned, exported')
    expect(values).toEqual(['job', 'old', 'attempt', '/video', 3])
  })
  it('fences failure writes so a stale worker cannot overwrite its replacement', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] })
    await dbMarkBannerFailed('job', 'old', 'failed')
    expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('status=\'rendering\' AND started_at=$2::timestamptz'), ['job', 'old', 'failed'])
  })
})
