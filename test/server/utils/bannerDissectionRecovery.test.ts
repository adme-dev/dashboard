import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const m = vi.hoisted(() => ({ claim: vi.fn(), expire: vi.fn(), send: vi.fn() }))
vi.mock('~~/server/utils/banner/dissectionJobs', () => ({
  claimDissectionDispatchBatch: m.claim, expireDissectionRecoveryBatch: m.expire,
  DISSECTION_RECOVERY_BATCH_SIZE: 20,
  dissectionRecoveryLimit: (limit = 20) => Math.min(20, Math.max(1, limit))
}))
vi.mock('~~/server/utils/banner/dissectionDispatch', () => ({ sendDissectionDispatch: m.send }))
const { recoverDissectionDispatches } = await import('../../../server/utils/banner/dissectionRecovery')
const event = (queue = true) => ({ context: queue ? { cloudflare: { env: { JOBS_QUEUE: { send: vi.fn() } } } } : {}, waitUntil: vi.fn() }) as unknown as H3Event
beforeEach(() => {
  vi.resetAllMocks()
  m.claim.mockResolvedValue([])
  m.expire.mockResolvedValue([])
  m.send.mockResolvedValue('acknowledged')
})
describe('bounded dissection recovery orchestration', () => {
  it('requires a queue even when request lifetime execution exists', async () => {
    expect(await recoverDissectionDispatches(event(false))).toMatchObject({ ran: false, reason: 'queue_unavailable' })
    expect(m.claim).not.toHaveBeenCalled()
    expect(m.expire).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
  })
  it('expires and leases bounded batches and returns content-free transport counts', async () => {
    m.expire.mockResolvedValue([{ job_id: 'private-expired' }])
    m.claim.mockResolvedValue([{ job_id: 'private-job', source_r2_key: 'private-key' }, { job_id: 'other' }])
    m.send.mockResolvedValueOnce('acknowledged').mockResolvedValueOnce('uncertain')
    const result = await recoverDissectionDispatches(event(), { limit: 9999 })
    expect(m.expire).toHaveBeenCalledWith(20)
    expect(m.claim).toHaveBeenCalledWith(20)
    expect(result).toEqual({ ran: true, expired: 1, leased: 2, acknowledged: 1, uncertain: 1 })
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('continues bounded delivery after an individual ambiguous persistence failure', async () => {
    m.claim.mockResolvedValue([{ job_id: 'a' }, { job_id: 'b' }])
    m.send.mockRejectedValueOnce(new Error('private database body'))
    const result = await recoverDissectionDispatches(event(), { limit: 2 })
    expect(m.send).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ uncertain: 1, acknowledged: 1 })
    expect(JSON.stringify(result)).not.toContain('private')
  })
})
