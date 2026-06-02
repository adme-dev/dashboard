import { describe, it, expect, vi } from 'vitest'
import { textToSpeech, detectAudioFormat } from '~~/server/utils/aiVoice'

// Build a fake H3Event whose Workers AI binding returns whatever `run` yields.
function eventWithAI(run: (model: string, inputs: any) => Promise<any>) {
  return { context: { cloudflare: { env: { AI: { run: vi.fn(run) } } } } } as any
}

const b64 = (bytes: number[]) => Buffer.from(Uint8Array.from(bytes)).toString('base64')
// "RIFF" + 4 size bytes + "WAVE" + a little payload
const WAV = [0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 1, 2, 3, 4]
// MPEG frame sync
const MP3 = [0xff, 0xfb, 0x90, 0x00, 0x11, 0x22]

describe('textToSpeech (Workers AI melotts response handling)', () => {
  it('decodes the real { audio: <base64> } response shape into bytes (regression: used to 503)', async () => {
    const event = eventWithAI(async () => ({ audio: b64(WAV) }))
    const out = await textToSpeech(event, 'Robbo has got no cash again.', { lang: 'en' })
    expect(out).not.toBeNull()
    expect(out!.format).toBe('wav')
    expect(Array.from(new Uint8Array(out!.audioBuffer))).toEqual(WAV)
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
