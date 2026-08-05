import { describe, it, expect, vi } from 'vitest'
import { textToSpeech, detectAudioFormat } from '~~/server/utils/aiVoice'

const mockRecordAiInvocation = vi.fn()

vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: vi.fn(async () => []),
  execute: vi.fn(async () => 1),
}))

// Build a fake H3Event whose Workers AI binding returns whatever `run` yields.
function eventWithAI(run: (model: string, inputs: any, options?: any) => Promise<any>, gatewayUrl = 'https://gateway.ai.cloudflare.com/v1/account/agency-gateway') {
  return { context: { cloudflare: { env: { AI: { run: vi.fn(run) }, AI_GATEWAY_URL: gatewayUrl } } } } as any
}

const b64 = (bytes: number[]) => Buffer.from(Uint8Array.from(bytes)).toString('base64')
// "RIFF" + 4 size bytes + "WAVE" + a little payload
const WAV = [0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 1, 2, 3, 4]
// MPEG frame sync
const MP3 = [0xff, 0xfb, 0x90, 0x00, 0x11, 0x22]

describe('textToSpeech (Workers AI melotts response handling)', () => {
  it('decodes the real { audio: <base64> } response shape into bytes (regression: used to 503)', async () => {
    mockRecordAiInvocation.mockReset()
    mockRecordAiInvocation.mockResolvedValue(undefined)
    const event = eventWithAI(async () => ({ audio: b64(WAV) }))
    const out = await textToSpeech(event, 'Robbo has got no cash again.', { lang: 'en' })
    expect(out).not.toBeNull()
    expect(out!.format).toBe('wav')
    expect(Array.from(new Uint8Array(out!.audioBuffer))).toEqual(WAV)
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'workers_ai_text_to_speech',
      provider: 'workers_ai',
      modelId: '@cf/myshell-ai/melotts',
      status: 'success',
      gatewayUsed: true,
    }))
    expect((event as any).context.cloudflare.env.AI.run).toHaveBeenCalledWith(
      '@cf/myshell-ai/melotts',
      expect.objectContaining({ prompt: expect.any(String), lang: 'en' }),
      { gateway: { id: 'agency-gateway', metadata: expect.objectContaining({ featureKey: 'workers_ai_text_to_speech' }) } }
    )
  })

  it('labels mp3 output correctly', async () => {
    const event = eventWithAI(async () => ({ audio: b64(MP3) }))
    const out = await textToSpeech(event, 'hello world', { lang: 'en' })
    expect(out).not.toBeNull()
    expect(out!.format).toBe('mp3')
  })

  it('returns null when the AI binding is absent (local dev)', async () => {
    const out = await textToSpeech({ context: {} } as any, 'hello world')
    expect(out).toBeNull()
  })

  it('fails closed before checkpoint and dispatch when the configured gateway is absent or invalid', async () => {
    for (const gatewayUrl of ['', 'https://gateway.ai.cloudflare.com/not-a-gateway']) {
      const event = eventWithAI(async () => ({ audio: b64(WAV) }), gatewayUrl)
      const checkpoint = vi.fn()
      await expect(textToSpeech(event, 'hello world', { beforeDispatch: checkpoint })).resolves.toBeNull()
      expect(checkpoint).not.toHaveBeenCalled()
      expect((event as any).context.cloudflare.env.AI.run).not.toHaveBeenCalled()
    }
  })

  it('places the owner checkpoint on the exact provider-owned boundary and preserves ambiguous post-dispatch failure', async () => {
    const order: string[] = []
    const event = eventWithAI(async () => { order.push('ai.run'); throw new Error('response lost') })
    const checkpoint = vi.fn(async () => { order.push('checkpoint') })
    await expect(textToSpeech(event, 'hello world', { beforeDispatch: checkpoint })).resolves.toBeNull()
    expect(order).toEqual(['checkpoint', 'ai.run'])
    expect(checkpoint).toHaveBeenCalledTimes(1)
  })

  it('returns null on an empty audio field rather than throwing', async () => {
    const event = eventWithAI(async () => ({ audio: '' }))
    const out = await textToSpeech(event, 'hello world')
    expect(out).toBeNull()
  })

  it('still handles a raw ArrayBuffer response (fallback shape)', async () => {
    const event = eventWithAI(async () => Uint8Array.from(WAV).buffer)
    const out = await textToSpeech(event, 'hello world')
    expect(out).not.toBeNull()
    expect(out!.format).toBe('wav')
  })
})

describe('detectAudioFormat', () => {
  it('detects WAV from RIFF/WAVE header', () => {
    expect(detectAudioFormat(Uint8Array.from(WAV))).toBe('wav')
  })
  it('detects MP3 from frame sync', () => {
    expect(detectAudioFormat(Uint8Array.from(MP3))).toBe('mp3')
  })
  it('detects MP3 from ID3 tag', () => {
    expect(detectAudioFormat(Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00]))).toBe('mp3')
  })
  it('defaults to mp3 for unknown bytes', () => {
    expect(detectAudioFormat(Uint8Array.from([0, 1, 2, 3]))).toBe('mp3')
  })
})
