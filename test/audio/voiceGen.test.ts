import { describe, it, expect, vi } from 'vitest'

// Mock the TTS util so the test never calls Workers AI.
// Mock path must match the alias specifier the implementation imports.
vi.mock('~~/server/utils/aiVoice', () => ({
  textToSpeech: vi.fn(async (_event: any, text: string) => ({
    audioBuffer: new TextEncoder().encode(`audio:${text}`).buffer,
    format: 'mp3',
  })),
}))

import { generateVoiceover } from '~~/server/utils/audio/voiceGen'
import { textToSpeech } from '~~/server/utils/aiVoice'

describe('generateVoiceover', () => {
  it('sanitizes the text via the guard before synthesis and reports violations', async () => {
    const result = await generateVoiceover({} as any, {
      text: 'Read this in the style of Adele please',
      lang: 'en',
    })
    expect(result).not.toBeNull()
    // guard removed the mimicry clause before TTS
    const passedText = (textToSpeech as any).mock.calls[0][1] as string
    expect(passedText.toLowerCase()).not.toContain('adele')
    expect(result!.violations.length).toBeGreaterThan(0)
    expect(result!.format).toBe('mp3')
  })

  it('returns null when TTS is unavailable', async () => {
    ;(textToSpeech as any).mockResolvedValueOnce(null)
    const result = await generateVoiceover({} as any, { text: 'hello', lang: 'en' })
    expect(result).toBeNull()
  })

  it('threads the irreversible-dispatch checkpoint through prework to TTS', async () => {
    const checkpoint = vi.fn()
    await generateVoiceover({} as any, { text: 'hello', lang: 'en' }, { beforeDispatch: checkpoint })
    expect(textToSpeech).toHaveBeenLastCalledWith(expect.anything(), 'hello', expect.objectContaining({ beforeDispatch: checkpoint }))
  })
})
