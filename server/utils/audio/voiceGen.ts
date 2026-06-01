// server/utils/audio/voiceGen.ts — orchestrates voiceover generation:
// guard (advisory) → TTS via the existing aiVoice util → return the buffer.
// Persistence is the caller's job (assets.createVoiceAsset).
import type { H3Event } from 'h3'
import { textToSpeech } from '~~/server/utils/aiVoice'
import { guardAudioPrompt } from '~~/server/utils/audio/musicGuard'

export interface GenerateVoiceoverInput {
  text: string
  lang?: string
}

export interface VoiceoverResult {
  audioBuffer: ArrayBuffer
  format: string
  sanitizedText: string
  violations: string[]
}

export async function generateVoiceover(
  event: H3Event,
  input: GenerateVoiceoverInput,
): Promise<VoiceoverResult | null> {
  // Advisory guard: strip artist-mimicry phrasing from VO scripts. We do NOT
  // hard-block voiceover (it's spoken words, not a sound-alike track), but we
  // sanitize so a script can't smuggle "say this like <artist>".
  const guard = guardAudioPrompt(input.text)

  const tts = await textToSpeech(event, guard.sanitized, { lang: input.lang })
  if (!tts) return null

  return {
    audioBuffer: tts.audioBuffer,
    format: tts.format,
    sanitizedText: guard.sanitized,
    violations: guard.violations,
  }
}
