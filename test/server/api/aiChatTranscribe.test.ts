import { beforeEach, describe, expect, it, vi } from 'vitest'

type Part = { name: string, data?: Buffer, type?: string }
type TestEvent = { _parts?: Part[] }

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readMultipartFormData: (event: TestEvent) => Part[] | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readMultipartFormData = event => event._parts
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & { statusCode: number, statusMessage: string }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireAuth = vi.fn()
const mockSpeechToText = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))
vi.mock('~~/server/utils/aiVoice', () => ({
  speechToText: (...args: unknown[]) => mockSpeechToText(...args)
}))

const { default: handler } = await import('../../../server/api/agency/ai/chat/transcribe.post')

type HandlerEvent = Parameters<typeof handler>[0]

function evt(parts?: Part[]): TestEvent {
  return { _parts: parts }
}

function run(parts?: Part[]) {
  return handler(evt(parts) as unknown as HandlerEvent)
}

function audio(): Part {
  return { name: 'audio', data: Buffer.alloc(200, 1), type: 'audio/webm' }
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue({ id: 'u1', role: 'owner' })
  mockSpeechToText.mockReset()
})

describe('POST /api/agency/ai/chat/transcribe', () => {
  it('returns the transcript (no agent involved)', async () => {
    mockSpeechToText.mockResolvedValue({ text: 'confirm', durationMs: 5 })
    expect(await run([audio()])).toEqual({ text: 'confirm' })
    expect(mockSpeechToText).toHaveBeenCalledWith(expect.anything(), expect.any(Buffer), {
      featureKey: 'agency_ai_voice_stt',
      userId: 'u1',
      metadata: { route: '/api/agency/ai/chat/transcribe' },
    })
  })

  it('rejects a missing audio part with 400', async () => {
    await expect(run([])).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an invalid mime type with 400', async () => {
    await expect(run([{ name: 'audio', data: Buffer.alloc(200, 1), type: 'text/plain' }]))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an oversized clip with 400', async () => {
    await expect(run([{ name: 'audio', data: Buffer.alloc(10 * 1024 * 1024 + 1, 1), type: 'audio/webm' }]))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a too-short clip with 422', async () => {
    await expect(run([{ name: 'audio', data: Buffer.alloc(50, 1), type: 'audio/webm' }]))
      .rejects.toMatchObject({ statusCode: 422 })
  })

  it('accepts a codec-qualified mime (audio/webm;codecs=opus)', async () => {
    mockSpeechToText.mockResolvedValue({ text: 'yes', durationMs: 4 })
    expect(await run([{ name: 'audio', data: Buffer.alloc(200, 1), type: 'audio/webm;codecs=opus' }])).toEqual({ text: 'yes' })
  })

  it('returns 422 when STT finds nothing', async () => {
    mockSpeechToText.mockResolvedValue(null)
    await expect(run([audio()])).rejects.toMatchObject({ statusCode: 422 })
  })

  it('requires auth', async () => {
    mockRequireAuth.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(run([audio()])).rejects.toMatchObject({ statusCode: 401 })
  })
})
