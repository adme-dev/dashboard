import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DissectionRecord } from '../../../server/utils/banner/dissectionJobs'

const m = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), prepare: vi.fn(), dispatch: vi.fn() }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: m.auth }))
vi.mock('~~/server/utils/banner/dissectionJobs', async original => ({ ...await original<typeof import('../../../server/utils/banner/dissectionJobs')>(), loadDissection: m.load, prepareDissectionRetry: m.prepare }))
vi.mock('~~/server/utils/banner/dissectionDispatch', () => ({ dispatchDissection: m.dispatch }))
const processJob = (await import('../../../server/api/agency/banner-studio/dissect/process.post')).default
const request = (body: unknown) => ({ body, context: {} }) as never
const old = (): DissectionRecord => ({ job_id: 'job', status: 'failed', manifest: { execution: { attemptId: 'old', attempt: 1, maxAttempts: 3, stage: 'failed', startedAt: null, updatedAt: '2026-10-26T00:00:00Z' } } })
beforeEach(() => {
  vi.resetAllMocks()
  m.auth.mockResolvedValue({ id: 'owner' })
  m.load.mockResolvedValue(old())
  m.prepare.mockResolvedValue(null)
})

describe('asynchronous explicit dissection retry API admission', () => {
  it('authenticates and checks ownership before retry mutation or dispatch', async () => {
    m.load.mockRejectedValue({ statusCode: 404 })
    await expect(processJob(request({ jobId: 'job', retry: true, expectedAttemptId: 'old' }))).rejects.toMatchObject({ statusCode: 404 })
    expect(m.load).toHaveBeenCalledWith('job', 'owner')
    expect(m.prepare).not.toHaveBeenCalled()
    expect(m.dispatch).not.toHaveBeenCalled()
  })
  it('dispatches only the newly persisted generation and returns its latest status', async () => {
    const queued = old()
    queued.status = 'queued'
    queued.manifest!.execution = { ...queued.manifest!.execution!, attemptId: 'new', attempt: 2, stage: 'queued' }
    m.prepare.mockResolvedValue(queued)
    m.load.mockResolvedValueOnce(old()).mockResolvedValue(queued)
    const response = await processJob(request({ jobId: 'job', retry: true, expectedAttemptId: 'old' }))
    expect(m.prepare).toHaveBeenCalledWith('job', 'owner', 'old')
    expect(m.dispatch).toHaveBeenCalledWith(expect.anything(), 'job', 'new')
    expect(response).toMatchObject({ status: 'queued', execution: { attemptId: 'new', attempt: 2 } })
  })
  it.each(['queued', 'analyzing', 'failed', 'cancelled', 'review_ready'])('recovers a duplicate old retry response from the newer %s generation without redispatch', async (status) => {
    const newer = old()
    newer.status = status
    newer.manifest!.execution!.attemptId = 'new'
    m.load.mockResolvedValue(newer)
    const response = await processJob(request({ jobId: 'job', retry: true, expectedAttemptId: 'old' }))
    expect(response).toMatchObject({ status, execution: { attemptId: 'new' } })
    expect(m.dispatch).not.toHaveBeenCalled()
  })
  it.each(['queued', 'analyzing', 'segmenting'])('keeps an active %s generation without redispatch', async (status) => {
    const active = old()
    active.status = status
    m.load.mockResolvedValue(active)
    expect(await processJob(request({ jobId: 'job', retry: true, expectedAttemptId: 'old' }))).toMatchObject({ status })
    expect(m.dispatch).not.toHaveBeenCalled()
  })
  it('refuses an exhausted reviewed generation without dispatch', async () => {
    const exhausted = old()
    exhausted.manifest!.execution!.attempt = 3
    m.load.mockResolvedValue(exhausted)
    await expect(processJob(request({ jobId: 'job', retry: true, expectedAttemptId: 'old' }))).rejects.toMatchObject({ statusCode: 409 })
    expect(m.dispatch).not.toHaveBeenCalled()
  })
  it('never implicitly retries or redispatches a non-retry process request', async () => {
    expect(await processJob(request({ jobId: 'job' }))).toMatchObject({ status: 'failed' })
    expect(m.prepare).not.toHaveBeenCalled()
    expect(m.dispatch).not.toHaveBeenCalled()
  })
  it.each([undefined, '', 15, 'x'.repeat(201)])('rejects an invalid expected generation: %s', async (expectedAttemptId) => {
    await expect(processJob(request({ jobId: 'job', retry: true, expectedAttemptId }))).rejects.toMatchObject({ statusCode: 400 })
    expect(m.prepare).not.toHaveBeenCalled()
    expect(m.dispatch).not.toHaveBeenCalled()
  })
})
