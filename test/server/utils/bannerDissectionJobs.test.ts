import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ query: vi.fn(), rows: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: db.query, queryRowsFresh: db.rows }))
const jobs = await import('../../../server/utils/banner/dissectionJobs')
beforeEach(() => vi.resetAllMocks())

describe('durable dissection controls (local mocked DB, not database concurrency proof)', () => {
  it('claims only the queued generation, with one conditional database write', async () => {
    db.query.mockResolvedValue({ job_id: 'job', manifest: { execution: { attemptId: 'a', attempt: 1 } } })
    await jobs.claimDissectionAttempt('job', { attemptId: 'a' })
    const [sql, args] = db.query.mock.calls.find(([sql]) => sql.includes('RETURNING *'))!
    expect(sql).toContain('status = \'queued\'')
    expect(sql).toContain('manifest->\'execution\'->>\'attemptId\'')
    expect(args).toContain('a')
    expect(sql).toContain('RETURNING')
  })
  it('rejects unbound execution even when a queued job exists', async () => {
    db.query.mockResolvedValue({ job_id: 'job', status: 'queued' })
    expect(await jobs.claimDissectionAttempt('job')).toBeNull()
    expect(db.query).not.toHaveBeenCalled()
  })
  it('exposes a stable legacy retry identity without changing legacy result hashes', () => {
    const row = { job_id: 'legacy-job', status: 'failed', updated_at: '2026-10-26T00:00:00Z' }
    expect(jobs.dissectionSnapshot(row)).toMatchObject({ execution: { attemptId: 'legacy:legacy-job', attempt: 1, maxAttempts: 3 } })
  })
  it('fences every stage write against attempt and active state', async () => {
    db.query.mockResolvedValue(null)
    expect(await jobs.writeDissectionAttempt('job', { attemptId: 'old', attempt: 1, maxAttempts: 3, stage: 'analyzing', startedAt: 'now', updatedAt: 'now' }, 'segmenting', { layers: [] })).toBeNull()
    expect(db.query.mock.calls[0][0]).toContain('manifest->\'execution\'->>\'attemptId\'')
    expect(db.query.mock.calls[0][0]).toContain('status IN (\'analyzing\', \'segmenting\')')
    expect(db.query.mock.calls[0][1]).toContain('old')
  })
  it('returns authoritative row status, identity and progress over stale manifest fields', () => {
    const snapshot = jobs.dissectionSnapshot({ job_id: 'real', status: 'cancelled', manifest: { jobId: 'spoof', status: 'complete', layers: [], execution: { attemptId: 'a', stage: 'cancelled', completed: 2, total: 3 } } })
    expect(snapshot).toMatchObject({ jobId: 'real', status: 'cancelled', progress: { stage: 'cancelled', completed: 2, total: 3 } })
    expect(snapshot).not.toHaveProperty('layers')
  })
  it('expires abandoned work without starting providers or a replacement attempt', async () => {
    db.query.mockResolvedValue(null)
    await jobs.expireDissectionAttempt('job', 'owner')
    expect(db.query.mock.calls[0][0]).toContain('status IN (\'queued\', \'analyzing\', \'segmenting\')')
    expect(db.query.mock.calls[0][0]).toContain('deadlineAt')
    expect(db.query.mock.calls[0][0]).toContain('clock_timestamp()')
    expect(db.query.mock.calls[0][1]).toContain('owner')
  })
  it('uses order-independent result identity and binds it to an attempt generation', () => {
    const first = { layers: [{ id: 'a', type: 'logo', region: { x: 1, y: 2 } }] }
    const reordered = { layers: [{ region: { y: 2, x: 1 }, type: 'logo', id: 'a' }] }
    expect(jobs.dissectionResultId(first as never, 'a')).toBe(jobs.dissectionResultId(reordered as never, 'a'))
    expect(jobs.dissectionResultId(first as never, 'a')).not.toBe(jobs.dissectionResultId(first as never, 'b'))
  })
})

describe('dissection dispatch metadata and SQL fences', () => {
  it('issues one provider generation with a separate durable pending transport identity', () => {
    const first = jobs.queuedDissectionManifest('generation')
    const second = jobs.queuedDissectionManifest('generation')
    expect(first.execution).toMatchObject({ attemptId: 'generation', attempt: 1, maxAttempts: 3, dispatch: { version: 1, state: 'pending', sendCount: 0, leaseToken: null, leaseUntil: null } })
    expect(first.execution.dispatch.deliveryId).not.toBe(second.execution.dispatch.deliveryId)
    expect(first.execution.dispatch.deliveryId).not.toBe('generation')
  })
  it('persists new retry intent and DB-clock deadlines in the generation reservation write', async () => {
    await jobs.prepareDissectionRetry('job', 'owner', 'previous')
    const [sql, args] = db.query.mock.calls[1]
    expect(sql).toContain('\'deadlineAt\', clock_timestamp() + interval \'10 minutes\'')
    expect(sql).toContain('\'nextAttemptAt\', clock_timestamp()')
    expect(JSON.parse(args[3]).dispatch).toMatchObject({ version: 1, sendCount: 0, state: 'pending' })
    expect(args[4]).toBe(3)
  })
  it('reserves transport only for a known queued generation with a due DB-clock lease and send budget', async () => {
    await jobs.reserveDissectionDispatch('job', 'generation')
    const [sql, args] = db.query.mock.calls[0]
    expect(args).toEqual(['job', 'generation'])
    expect(sql).toContain('status = \'queued\'')
    expect(sql).toContain('\'dispatch\'->>\'version\' = \'1\'')
    expect(sql).toContain('\'sendCount\')::int < 5')
    expect(sql).toContain('clock_timestamp()')
    expect(sql).not.toContain('\'attempt\',')
  })
  it('fences acknowledgement by generation, lease token, live lease, and queued state', async () => {
    await jobs.acknowledgeDissectionDispatch('job', 'generation', 'lease', true)
    const [sql, args] = db.query.mock.calls[0]
    expect(args).toEqual(['job', 'generation', 'lease', 'acknowledged'])
    expect(sql).toContain('\'leaseToken\' = $3')
    expect(sql).toContain('\'leaseUntil\')::timestamptz > clock_timestamp()')
    expect(sql).toContain('status = \'queued\'')
    expect(sql).toContain('\'state\' = \'leased\'')
  })
  it.each([[-5, 1], [0, 1], [2.8, 2], [200, 20], [NaN, 20], [Infinity, 20]])('clamps recovery limit %s to %s', (input, expected) => {
    expect(jobs.dissectionRecoveryLimit(input)).toBe(expected)
  })
  it('bounds lock-skipping batches and repeats authoritative guards in the update', async () => {
    await jobs.claimDissectionDispatchBatch(999)
    const [sql, args] = db.rows.mock.calls[0]
    expect(args).toEqual([20])
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain('d.status = \'queued\'')
    expect(sql).toContain('d.manifest->\'execution\'->\'dispatch\'->>\'version\' = \'1\'')
  })
  it('expires only known overdue active attempts without claiming providers or changing generation', async () => {
    await jobs.expireDissectionRecoveryBatch(999)
    const [sql, args] = db.rows.mock.calls[0]
    expect(args).toEqual([20])
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain('d.status IN (\'queued\', \'analyzing\', \'segmenting\')')
    expect(sql).toContain('CASE WHEN manifest->\'execution\'->\'dispatch\'->>\'version\' = \'1\'')
    expect(sql).not.toContain('gen_random_uuid')
    expect(sql).not.toContain('\'attempt\',')
  })
})
