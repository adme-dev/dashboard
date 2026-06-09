import { describe, expect, it, vi } from 'vitest'
import { reconcileRunningJob } from '~~/server/utils/video-generation/reconcile'
import type { VideoGenerationJob } from '~~/server/utils/video-generation/types'

const job = { id: 'j1', tenantId: 'agency', projectId: 'p1', createdBy: 'u1', provider: 'muapi', modelId: 'muapi/i2v-kling', providerRequestId: 'req-1', aspectRatio: '9:16', durationSeconds: 5 } as unknown as VideoGenerationJob

describe('reconcileRunningJob', () => {
  it('finalizes when the provider now reports succeeded', async () => {
    const deps = {
      providers: { muapi: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: 'https://cdn/o.mp4', actualCostCents: 30 }) } },
      finalize: vi.fn().mockResolvedValue({ ...job, status: 'succeeded' }),
      markFailed: vi.fn(),
    }
    const r = await reconcileRunningJob(job, deps as any)
    expect(deps.finalize).toHaveBeenCalled()
    expect(r).toBe('succeeded')
  })

  it('leaves still-running jobs untouched', async () => {
    const deps = { providers: { muapi: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'running', outputUrl: null, actualCostCents: null }) } }, finalize: vi.fn(), markFailed: vi.fn() }
    expect(await reconcileRunningJob(job, deps as any)).toBe('running')
    expect(deps.finalize).not.toHaveBeenCalled()
  })

  it('skips a job with no providerRequestId', async () => {
    const deps = { providers: { muapi: { submit: vi.fn(), poll: vi.fn() } }, finalize: vi.fn(), markFailed: vi.fn() }
    const noReq = { ...job, providerRequestId: null } as any
    expect(await reconcileRunningJob(noReq, deps as any)).toBe('skipped')
    expect(deps.providers.muapi.poll).not.toHaveBeenCalled()
  })

  it('marks failed when the provider now reports failed', async () => {
    const deps = {
      providers: { muapi: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'nsfw' }) } },
      finalize: vi.fn(), markFailed: vi.fn().mockResolvedValue({ ...job, status: 'failed' }),
    }
    expect(await reconcileRunningJob(job, deps as any)).toBe('failed')
    expect(deps.markFailed).toHaveBeenCalledWith('j1', 'nsfw')
    expect(deps.finalize).not.toHaveBeenCalled()
  })
})
