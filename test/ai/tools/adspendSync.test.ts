import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../../../server/utils/ai/toolContext'
import {
  getAdspendSyncStatus,
  runAdspendSync,
  type AdspendSyncDeps,
  type SpendSyncJobRow,
} from '../../../server/utils/ai/tools/adspendSync'

const META_ID = '11111111-1111-4111-8111-111111111111'
const GOOGLE_ID = '22222222-2222-4222-8222-222222222222'
const ctx = { userId: '33333333-3333-4333-8333-333333333333', userRole: 'owner' } as ToolContext

function deps(overrides: Partial<AdspendSyncDeps> = {}): AdspendSyncDeps {
  return {
    reserveCooldown: vi.fn().mockResolvedValue({ accepted: true, nextAllowedAt: '2026-08-21T01:30:00.000Z' }),
    releaseCooldown: vi.fn().mockResolvedValue(undefined),
    startPlatform: vi.fn(async platform => ({
      jobId: platform === 'meta' ? META_ID : GOOGLE_ID,
      status: 'started',
      startedAt: '2026-08-21T01:00:00.000Z',
    })),
    loadJobs: vi.fn().mockResolvedValue([]),
    now: () => new Date('2026-08-21T01:00:00.000Z'),
    ...overrides,
  }
}

function row(overrides: Partial<SpendSyncJobRow>): SpendSyncJobRow {
  return {
    id: META_ID,
    platform: 'meta',
    period: '2026-08',
    status: 'completed',
    synced_count: 80,
    failures: [],
    error: null,
    started_at: '2026-08-21T01:00:00.000Z',
    finished_at: '2026-08-21T01:05:00.000Z',
    total_accounts: 4,
    processed_accounts: 4,
    coverage_failed: false,
    ...overrides,
  }
}

describe('MCP ad-spend sync controls', () => {
  it('starts both providers asynchronously and returns one opaque handle', async () => {
    const d = deps()
    const result = await runAdspendSync({ platform: 'all' }, ctx, d)
    expect(result.ok).toBe(true)
    expect((result as any).data).toMatchObject({
      accepted: true,
      asynchronous: true,
      handle: `adspend-sync-v1:${META_ID},${GOOGLE_ID}`,
    })
    expect(d.startPlatform).toHaveBeenCalledTimes(2)
  })

  it('refuses a repeat invocation during the atomic cooldown', async () => {
    const d = deps({
      reserveCooldown: vi.fn().mockResolvedValue({ accepted: false, nextAllowedAt: '2026-08-21T01:20:00.000Z' }),
    })
    const result = await runAdspendSync({ platform: 'meta' }, ctx, d)
    expect((result as any).data).toMatchObject({ accepted: false, reason: 'cooldown', cooldownRemainingSeconds: 1200 })
    expect(d.startPlatform).not.toHaveBeenCalled()
  })

  it('reports completed only after all accounts finish with verified coverage', async () => {
    const d = deps({ loadJobs: vi.fn().mockResolvedValue([row({})]) })
    const result = await getAdspendSyncStatus({ handle: `adspend-sync-v1:${META_ID}` }, ctx, d)
    expect((result as any).data).toMatchObject({ state: 'completed', coverageVerified: true, rowsWritten: 80 })
  })

  it('reports a terminal failure when the coverage gate failed despite written rows', async () => {
    const d = deps({ loadJobs: vi.fn().mockResolvedValue([row({ status: 'failed', synced_count: 72, coverage_failed: true })]) })
    const result = await getAdspendSyncStatus({ handle: `adspend-sync-v1:${META_ID}` }, ctx, d)
    expect((result as any).data).toMatchObject({ state: 'failed', coverageVerified: false, rowsWritten: 72 })
  })

  it('does not disclose a handle whose jobs are not owned by the caller', async () => {
    const result = await getAdspendSyncStatus({ handle: `adspend-sync-v1:${META_ID}` }, ctx, deps())
    expect(result).toMatchObject({ ok: false, code: 'SYNC_NOT_FOUND' })
  })

  it('BF-3: a failed start reports the underlying reason and releases the cooldown', async () => {
    const err = Object.assign(new Error('AI internal read target is not registered'), { statusCode: 403 })
    const d = deps({ startPlatform: vi.fn().mockRejectedValue(err) })
    const result = await runAdspendSync({ platform: 'meta' }, ctx, d)
    expect(result).toMatchObject({ ok: false, code: 'SYNC_START_FAILED' })
    expect((result as any).error).toMatch(/meta/)
    expect((result as any).error).toMatch(/403/)
    expect((result as any).error).toMatch(/not registered/)
    expect(d.releaseCooldown).toHaveBeenCalledTimes(1)
  })

  it('BF-3: a partial start (one platform fails) keeps the started job and names the failed one', async () => {
    const d = deps({
      startPlatform: vi.fn(async (platform) => {
        if (platform === 'google') throw Object.assign(new Error('boom'), { statusCode: 500 })
        return { jobId: META_ID, status: 'started', startedAt: '2026-08-21T01:00:00.000Z' }
      }),
    })
    const result = await runAdspendSync({ platform: 'all' }, ctx, d)
    expect(result.ok).toBe(true)
    expect((result as any).data).toMatchObject({
      accepted: true,
      handle: `adspend-sync-v1:${META_ID}`,
      failedPlatforms: [{ platform: 'google', reason: expect.stringMatching(/500.*boom/) }],
    })
    expect(d.releaseCooldown).not.toHaveBeenCalled()
  })

  it('exposes per-account failure reasons in status so an auth-class outage is diagnosable', async () => {
    const failures = Array.from({ length: 3 }, (_, i) => ({ account: `Acct ${i}`, reason: 'Empty insights for an account with prior spend — likely access-tier/egress block' }))
    const d = deps({ loadJobs: vi.fn().mockResolvedValue([row({ status: 'failed', synced_count: 0, failures })]) })
    const result = await getAdspendSyncStatus({ handle: `adspend-sync-v1:${META_ID}` }, ctx, d)
    const job = (result as any).data.jobs[0]
    expect(job.failureCount).toBe(3)
    expect(job.failureReasons).toEqual({ groups: [{ reason: failures[0].reason, accounts: 3, examples: ['Acct 0', 'Acct 1', 'Acct 2'] }], more: 0 })
  })

  it('status load errors carry a reason instead of an opaque code', async () => {
    const d = deps({ loadJobs: vi.fn().mockRejectedValue(new Error('operator does not exist: text = uuid')) })
    const result = await getAdspendSyncStatus({ handle: `adspend-sync-v1:${META_ID}` }, ctx, d)
    expect(result).toMatchObject({ ok: false, code: 'SYNC_STATUS_FAILED' })
    expect((result as any).error).toMatch(/text = uuid/)
  })
})
