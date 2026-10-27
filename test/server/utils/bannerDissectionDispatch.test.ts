import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const m = vi.hoisted(() => ({ reserve: vi.fn(), authorize: vi.fn(), fail: vi.fn(), queued: vi.fn(), dispatchFailed: vi.fn(), start: vi.fn(), finish: vi.fn(), acknowledge: vi.fn(), insert: vi.fn(), pipeline: vi.fn() }))
vi.mock('~~/server/utils/banner/dissectionJobs', () => ({ reserveDissectionDispatch: m.reserve, isDissectionDispatchAuthorized: m.authorize, failDissectionDispatch: m.fail, acknowledgeDissectionDispatch: m.acknowledge }))
vi.mock('~~/server/utils/db', () => ({ execute: m.insert }))
vi.mock('~~/server/utils/jobExecutionLedger', () => ({ recordJobQueued: m.queued, markJobDispatchFailed: m.dispatchFailed, startJobExecution: m.start, finishJobExecution: m.finish }))
vi.mock('~~/server/utils/bannerDissectorPipeline', () => ({ runDissectionPipeline: m.pipeline }))
const { dispatchDissection } = await import('../../../server/utils/banner/dissectionDispatch')
const event = (context = {}, waitUntil?: (p: Promise<unknown>) => void) => ({ context, path: '/', node: { req: { headers: { host: 'localhost' }, url: '/' } }, ...(waitUntil ? { waitUntil } : {}) }) as H3Event
const queued = { job_id: 'job', status: 'queued', manifest: { execution: { attemptId: 'generation', attempt: 2, dispatch: { version: 1, deliveryId: 'intent', leaseToken: 'transport', sendCount: 1, lastSentAt: '2026-10-27T00:00:00Z' } } } }
const tick = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve()
}
beforeEach(() => {
  vi.resetAllMocks()
  m.authorize.mockResolvedValue(true)
  m.reserve.mockResolvedValue(queued)
  m.fail.mockResolvedValue({ ...queued, status: 'failed' })
  m.start.mockResolvedValue({ executionId: 'execution', jobId: 'ledger' })
  m.pipeline.mockResolvedValue({ status: 'review_ready' })
})

describe('dissection dispatch transport and lifetime boundaries', () => {
  it('prefers the existing queue producer and binds delivery to the reserved generation', async () => {
    const send = vi.fn(async () => {
      expect(m.insert).toHaveBeenCalledTimes(1)
    })
    const waitUntil = vi.fn()
    await dispatchDissection(event({ cloudflare: { env: { JOBS_QUEUE: { send } } } }, waitUntil), 'job', 'generation')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'dissect.analyze', payload: { jobId: 'job', attemptId: 'generation' } }), { contentType: 'json' })
    expect(waitUntil).not.toHaveBeenCalled()
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it('a duplicate dispatch reservation cannot enqueue or start provider work', async () => {
    m.reserve.mockResolvedValue(null)
    const send = vi.fn()
    await dispatchDissection(event({ cloudflare: { env: { JOBS_QUEUE: { send } } } }), 'job', 'generation')
    expect(send).not.toHaveBeenCalled()
    expect(m.queued).not.toHaveBeenCalled()
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it('fails honestly with no queue or registered lifetime capability and never calls a provider', async () => {
    await dispatchDissection(event(), 'job', 'generation')
    expect(m.fail).toHaveBeenCalledWith('job', 'generation', expect.stringMatching(/unavailable/i), 'transport')
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it.each(['event', 'context', 'cloudflare'])('registers %s waitUntil before provider work and returns while analysis remains pending', async (kind) => {
    const tasks: Promise<unknown>[] = []
    const waitUntil = vi.fn((p: Promise<unknown>) => {
      expect(m.pipeline).not.toHaveBeenCalled()
      tasks.push(p)
    })
    let done!: (v: { status: string }) => void
    m.pipeline.mockImplementation(() => new Promise((resolve) => {
      done = resolve
    }))
    const request = kind === 'event' ? event({}, waitUntil) : kind === 'context' ? event({ waitUntil }) : event({ cloudflare: { context: { waitUntil } } })
    await dispatchDissection(request, 'job', 'generation')
    await tick()
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(m.pipeline).toHaveBeenCalledWith(request, 'job', { attemptId: 'generation' })
    expect(m.finish).not.toHaveBeenCalled()
    done({ status: 'review_ready' })
    await Promise.all(tasks)
    expect(m.finish).toHaveBeenCalledWith(expect.anything(), 'succeeded', expect.any(Number))
  })
  it('never starts inference if lifetime registration throws even after retaining the promise', async () => {
    const tasks: Promise<unknown>[] = []
    await dispatchDissection(event({}, (p) => {
      tasks.push(p)
      throw new Error('private payload')
    }), 'job', 'generation')
    await Promise.all(tasks)
    expect(m.pipeline).not.toHaveBeenCalled()
    expect(m.fail).toHaveBeenCalled()
    expect(JSON.stringify(m.fail.mock.calls)).not.toContain('private payload')
  })
  it('never falls back or overwrites the execution ledger after an ambiguous queue send', async () => {
    const waitUntil = vi.fn()
    const send = vi.fn().mockRejectedValue(new Error('private provider body'))
    await dispatchDissection(event({ cloudflare: { env: { JOBS_QUEUE: { send } } } }, waitUntil), 'job', 'generation')
    expect(m.fail).not.toHaveBeenCalled()
    expect(m.acknowledge).toHaveBeenCalledWith('job', 'generation', 'transport', false)
    expect(m.dispatchFailed).not.toHaveBeenCalled()
    expect(waitUntil).not.toHaveBeenCalled()
    expect(m.pipeline).not.toHaveBeenCalled()
    expect(JSON.stringify(m.fail.mock.calls)).not.toContain('private provider body')
  })
  it('leaves a recoverable lease before sending when ledger registration throws', async () => {
    m.insert.mockRejectedValue(new Error('private ledger data'))
    const send = vi.fn()
    await dispatchDissection(event({ cloudflare: { env: { JOBS_QUEUE: { send } } } }), 'job', 'generation')
    expect(send).not.toHaveBeenCalled()
    expect(m.fail).not.toHaveBeenCalled()
    expect(m.acknowledge).toHaveBeenCalledWith('job', 'generation', 'transport', false)
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it('consumes background rejection and reports a content-free failure to the execution ledger', async () => {
    const tasks: Promise<unknown>[] = []
    m.pipeline.mockRejectedValue(new Error('private provider body'))
    await dispatchDissection(event({}, p => tasks.push(p)), 'job', 'generation')
    await Promise.all(tasks)
    expect(m.finish).toHaveBeenCalledWith(expect.anything(), 'failed', expect.any(Number), expect.any(Error), true)
    expect(m.finish.mock.calls[0][3].message).not.toContain('private provider body')
  })
  it('a ledger completion failure never retries provider work or overwrites its result', async () => {
    const tasks: Promise<unknown>[] = []
    m.finish.mockRejectedValue(new Error('ledger connection lost'))
    await dispatchDissection(event({}, p => tasks.push(p)), 'job', 'generation')
    await Promise.all(tasks)
    expect(m.pipeline).toHaveBeenCalledTimes(1)
    expect(m.fail).not.toHaveBeenCalled()
  })
  it('never sends or starts work when dispatch reservation acknowledgement is lost', async () => {
    m.reserve.mockRejectedValue(new Error('private database contents'))
    const send = vi.fn()
    await expect(dispatchDissection(event({ cloudflare: { env: { JOBS_QUEUE: { send } } } }), 'job', 'generation')).rejects.toMatchObject({ statusCode: 503 })
    expect(send).not.toHaveBeenCalled()
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it('returns a content-free recovery error if dispatch failure persistence also fails', async () => {
    m.fail.mockRejectedValue(new Error('private database contents'))
    await expect(dispatchDissection(event(), 'job', 'generation')).rejects.toMatchObject({ statusCode: 503 })
    expect(m.pipeline).not.toHaveBeenCalled()
  })
})

// Queue transport success cannot publish acknowledgement without the exact lease token.
it('settles acceptance against its persisted transport identity with a non-regressing ledger insert', async () => {
  const send = vi.fn()
  await dispatchDissection(event({ cloudflare: { env: { JOBS_QUEUE: { send } } } }), 'job', 'generation')
  expect(send.mock.calls[0][0].jobId).toBe('transport')
  expect(m.acknowledge).toHaveBeenCalledWith('job', 'generation', 'transport', true)
  expect(m.insert.mock.calls[0][0]).toContain('ON CONFLICT (id) DO NOTHING')
  expect(m.queued).not.toHaveBeenCalled()
})

it.each(['production', 'staging'])('never executes an inline fallback in %s even on loopback', async (mode) => {
  vi.stubEnv('NODE_ENV', mode)
  const waitUntil = vi.fn()
  await dispatchDissection(event({}, waitUntil), 'job', 'generation')
  expect(waitUntil).not.toHaveBeenCalled()
  expect(m.pipeline).not.toHaveBeenCalled()
  vi.unstubAllEnvs()
})
it('never executes a local fallback for a public host', async () => {
  const waitUntil = vi.fn()
  const request = event({}, waitUntil)
  request.node.req.headers.host = 'dashboard.example.com'
  await dispatchDissection(request, 'job', 'generation')
  expect(waitUntil).not.toHaveBeenCalled()
  expect(m.pipeline).not.toHaveBeenCalled()
})
it('keeps send acknowledgement persistence loss recoverable without failing the generation', async () => {
  m.acknowledge.mockRejectedValue(new Error('private commit error'))
  const send = vi.fn()
  await dispatchDissection(event({ cloudflare: { env: { JOBS_QUEUE: { send } } } }), 'job', 'generation')
  expect(send).toHaveBeenCalledTimes(1)
  expect(m.fail).not.toHaveBeenCalled()
  expect(m.pipeline).not.toHaveBeenCalled()
})


describe('dispatch access revocation', () => {
  it('does not enqueue or create transport metadata after a revoked source', async () => {
    m.authorize.mockRejectedValue(Object.assign(new Error('Revoked'), { statusCode: 403 }))
    const send = vi.fn()
    await expect(dispatchDissection(event({ cloudflare: { env: { JOBS_QUEUE: { send } } } }), 'job', 'generation')).rejects.toMatchObject({ statusCode: 403 })
    expect(send).not.toHaveBeenCalled()
    expect(m.insert).not.toHaveBeenCalled()
  })
  it('rechecks after transport ledger delay and before sending, without retrying', async () => {
    m.authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const send = vi.fn()
    await dispatchDissection(event({ cloudflare: { env: { JOBS_QUEUE: { send } } } }), 'job', 'generation')
    expect(m.insert).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
    expect(m.acknowledge).not.toHaveBeenCalled()
  })
})
