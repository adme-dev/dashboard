import type { H3Event } from 'h3'

/**
 * Voice AI utilities — STT (OpenAI Whisper) and TTS (MyShell MeloTTS)
 * via Cloudflare Workers AI binding.
 * All functions return null when the AI binding is unavailable (local dev).
 */

function getAI(event: H3Event): any | null {
  try {
    return (event.context as any).cloudflare?.env?.AI ?? null
  } catch {
    return null
  }
}

/** Check if Workers AI binding is available */
export function isVoiceAvailable(event: H3Event): boolean {
  return getAI(event) !== null
}

/**
 * Speech-to-text using OpenAI Whisper Large V3 Turbo via Workers AI.
 * Input audio is base64-encoded for the model.
 * Returns transcribed text or null on failure.
 */
export async function speechToText(
  event: H3Event,
  audioBuffer: ArrayBuffer | Uint8Array
): Promise<{ text: string; durationMs: number } | null> {
  const ai = getAI(event)
  if (!ai) return null

  if (!audioBuffer || (audioBuffer instanceof ArrayBuffer ? audioBuffer.byteLength : audioBuffer.length) === 0) {
    return null
  }

  try {
    const start = Date.now()
    const bytes = audioBuffer instanceof ArrayBuffer
      ? new Uint8Array(audioBuffer)
      : audioBuffer
    // Whisper Large V3 Turbo accepts base64-encoded audio
    const base64Audio = Buffer.from(bytes).toString('base64')
    const result = await ai.run('@cf/openai/whisper-large-v3-turbo', {
      audio: base64Audio,
    })
    const durationMs = Date.now() - start

    const text = result?.text?.trim() || result?.vtt?.replace(/WEBVTT\n\n[\d:.]+ --> [\d:.]+\n/g, '').trim() || ''
    if (!text) return null

    return { text, durationMs }
  } catch (err) {
    console.error('[aiVoice] STT failed:', err)
    return null
  }
}

/**
 * Text-to-speech using MyShell MeloTTS via Workers AI.
 * Strips markdown formatting before synthesis.
 * Returns mp3 audio buffer or null on failure.
 */
export async function textToSpeech(
  event: H3Event,
  text: string,
  options: { lang?: string } = {}
): Promise<{ audioBuffer: ArrayBuffer; format: string } | null> {
  const ai = getAI(event)
  if (!ai) return null

  try {
    // Strip markdown for cleaner speech
    const cleanText = stripMarkdown(text)
    if (!cleanText || cleanText.length < 2) return null

    // Truncate to avoid excessive TTS cost (max ~2000 chars)
    const truncated = cleanText.length > 2000
      ? cleanText.slice(0, 1997) + '...'
      : cleanText

    // MeloTTS uses `prompt` (not `text`) and `lang` parameters
    const result = await ai.run('@cf/myshell-ai/melotts', {
      prompt: truncated,
      lang: options.lang || 'en',
    })

    if (!result) return null

    // Primary shape: Workers AI returns base64-encoded audio in a JSON object,
    // i.e. { audio: "<base64>" } — NOT raw bytes or a stream. (Verified live
    // against @cf/myshell-ai/melotts, 2026-06-02; the bytes are a WAV.) Decode it.
    if (typeof result === 'object' && typeof (result as any).audio === 'string' && (result as any).audio.length > 0) {
      const bytes = Buffer.from((result as any).audio, 'base64')
      if (!bytes.byteLength) return null
      const audioBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      return { audioBuffer, format: detectAudioFormat(bytes) }
    }

    // Fallback: ReadableStream response (older Workers AI behaviour).
    if (result instanceof ReadableStream) {
      const reader = result.getReader()
      try {
        const chunks: Uint8Array[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) chunks.push(value)
        }
        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
        const merged = new Uint8Array(totalLength)
        let offset = 0
        for (const chunk of chunks) {
          merged.set(chunk, offset)
          offset += chunk.length
        }
        if (!totalLength) return null
        return { audioBuffer: merged.buffer.slice(0, totalLength), format: detectAudioFormat(merged) }
      } finally {
        reader.releaseLock()
      }
    }

    // Fallback: raw ArrayBuffer / typed-array.
    if ((result as any).byteLength) {
      const bytes = result instanceof Uint8Array ? result : new Uint8Array(result as ArrayBuffer)
      return { audioBuffer: result as ArrayBuffer, format: detectAudioFormat(bytes) }
    }

    return null
  } catch (err) {
    console.error('[aiVoice] TTS failed:', err)
    return null
  }
}

/** Sniff the container from the leading magic bytes so we label/serve the audio
 * correctly (MeloTTS returns WAV; other models may return MP3). Defaults to mp3. */
export function detectAudioFormat(bytes: Uint8Array): string {
  // "RIFF" .... "WAVE"
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
  ) return 'wav'
  // "ID3" tag or MPEG audio frame sync (0xFFEx/0xFFFx)
  if (
    bytes.length >= 2
    && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
      || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0))
  ) return 'mp3'
  return 'mp3'
}

/** Strip markdown formatting for cleaner TTS output */
function stripMarkdown(text: string): string {
  return text
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove images (before links — `![alt](url)` also matches link pattern)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove links, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bullet markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Remove numbered list markers
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    // Collapse whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
