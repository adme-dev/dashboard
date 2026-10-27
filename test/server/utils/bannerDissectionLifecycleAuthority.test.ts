import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  denied: false,
  queries: [] as string[],
  row: null as Record<string, any> | null,
  commitLost: false,
  transaction: vi.fn(),
  authorize: vi.fn()
}))
const query = vi.hoisted(() => vi.fn(async (sql: string) => {
  boundary.queries.push(sql)
  return { rows: boundary.row ? [structuredClone(boundary.row)] : [] }
}))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: async (sql: string) => (await query(sql)).rows[0] || null,
  queryRowsFresh: async (sql: string) => (await query(sql)).rows,
  transactionWithoutRetry: boundary.transaction
}))
vi.mock('~~/server/utils/banner/dissectionAccess', () => ({ assertDissectionAccess: boundary.authorize }))
const jobs = await import('../../../server/utils/banner/dissectionJobs')
const owner = '11111111-1111-4111-8111-111111111111'
const jobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const execution = { attemptId: 'attempt', attempt: 1, maxAttempts: 3, stage: 'analyzing', startedAt: null, updatedAt: '2026-10-27T00:00:00.000Z' }
beforeEach(() => {
  vi.clearAllMocks()
  boundary.denied = true
  boundary.commitLost = false
  boundary.queries = []
  boundary.row = { job_id: jobId, user_id: owner, status: 'analyzing', manifest: { execution } }
  boundary.authorize.mockImplementation(async () => {
    if (boundary.denied) throw Object.assign(new Error('Access revoked'), { statusCode: 403 })
  })
  boundary.transaction.mockImplementation(async callback => {
    const value = await callback({ query })
    if (boundary.commitLost) throw new Error('Lost commit acknowledgement')
    return value
  })
})

describe('Dissector lifecycle fresh-authority boundary', () => {
  it.each([
    ['dispatch reservation', () => jobs.reserveDissectionDispatch(jobId, 'attempt')],
    ['queue effect', () => jobs.isDissectionDispatchAuthorized(jobId, 'attempt', 'lease')],
    ['read', () => jobs.loadDissection(jobId, owner)],
    ['expiry', () => jobs.expireDissectionAttempt(jobId, owner)],
    ['retry', () => jobs.prepareDissectionRetry(jobId, owner, 'attempt')],
    ['cancel', () => jobs.cancelDissection(jobId, owner)],
    ['claim', () => jobs.claimDissectionAttempt(jobId, { attemptId: 'attempt' })],
    ['publish', () => jobs.writeDissectionAttempt(jobId, execution, 'complete', { layers: [] })],
    ['next provider effect', () => jobs.isDissectionAttemptActive(jobId, 'attempt')]
  ])('denies revoked access before %s can read content or mutate state', async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
    expect(boundary.authorize).toHaveBeenCalledOnce()
    expect(boundary.queries.filter(sql => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toEqual([])
  })
  it('derives execution actor from the persisted uploader rather than a queue payload', async () => {
    boundary.denied = false
    await jobs.claimDissectionAttempt(jobId, { attemptId: 'attempt' })
    expect(boundary.authorize).toHaveBeenCalledWith(expect.anything(), owner, expect.objectContaining({ user_id: owner }), 'execute')
  })
  it('does not replay a generation mutation after lost transaction acknowledgement', async () => {
    boundary.denied = false
    boundary.commitLost = true
    await expect(jobs.prepareDissectionRetry(jobId, owner, 'attempt')).rejects.toThrow('Lost commit acknowledgement')
    expect(boundary.transaction).toHaveBeenCalledOnce()
    expect(boundary.queries.filter(sql => sql.includes("SET status = 'queued'"))).toHaveLength(1)
  })
})
