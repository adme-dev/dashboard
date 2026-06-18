import { beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.readRawBody = async (event: any) => event.rawBody
g.getHeader = (event: any, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name]
g.createError = (input: any) => Object.assign(new Error(input.statusMessage), input)

const mockVerifyMuapiSignature = vi.fn()
vi.mock('~~/server/utils/video-generation/webhookAuth', () => ({
  verifyMuapiSignature: (...args: unknown[]) => mockVerifyMuapiSignature(...args),
}))

const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

const mockMapVideoGenerationJobRow = vi.fn()
const mockMarkVideoGenerationJobFailed = vi.fn()
vi.mock('~~/server/utils/video-generation/jobs', () => ({
  mapVideoGenerationJobRow: (...args: unknown[]) => mockMapVideoGenerationJobRow(...args),
  markVideoGenerationJobFailed: (...args: unknown[]) => mockMarkVideoGenerationJobFailed(...args),
}))

const mockFinalizeVideoGenerationJob = vi.fn()
vi.mock('~~/server/utils/video-generation/finalize', () => ({
  finalizeVideoGenerationJob: (...args: unknown[]) => mockFinalizeVideoGenerationJob(...args),
}))

const { default: handler } = await import('../../server/api/agency/video/generation/webhook.post')

function event(payload: Record<string, unknown>) {
  return {
    rawBody: JSON.stringify(payload),
    headers: { 'x-muapi-signature': 'sig' },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VIDEO_GENERATION_ENABLED = 'true'
  process.env.MUAPI_WEBHOOK_SECRET = 'secret'
  mockVerifyMuapiSignature.mockResolvedValue(true)
  mockQueryOne.mockResolvedValue(null)
  mockMapVideoGenerationJobRow.mockImplementation((row) => row)
})

describe('legacy MuAPI webhook endpoint', () => {
  it('queries only legacy muapi jobs by provider request id', async () => {
    await handler(event({ request_id: 'req-1', status: 'processing' }) as any)

    expect(mockQueryOne.mock.calls[0]![0]).toContain("provider = 'muapi'")
    expect(mockQueryOne.mock.calls[0]![1]).toEqual(['req-1'])
  })

  it('ignores a non-muapi job defensively if one is returned', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'job-1',
      provider: 'aigateway',
      status: 'running',
    })

    const res = await handler(event({ request_id: 'req-1', status: 'completed', outputs: ['https://cdn/out.mp4'] }) as any)

    expect(res).toEqual({ ok: true, ignored: 'wrong_provider' })
    expect(mockFinalizeVideoGenerationJob).not.toHaveBeenCalled()
    expect(mockMarkVideoGenerationJobFailed).not.toHaveBeenCalled()
  })

  it('rejects unsigned legacy webhook calls', async () => {
    mockVerifyMuapiSignature.mockResolvedValueOnce(false)

    await expect(handler(event({ request_id: 'req-1' }) as any)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
