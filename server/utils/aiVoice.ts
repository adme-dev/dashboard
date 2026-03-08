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

    if (!result || (!(result instanceof ReadableStream) && !result.byteLength)) return null

    // Handle ReadableStream response
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
        return { audioBuffer: merged.buffer.slice(0, totalLength), format: 'mp3' }
      } finally {
        reader.releaseLock()
      }
    }

    return { audioBuffer: result, format: 'mp3' }
  } catch (err) {
    console.error('[aiVoice] TTS failed:', err)
    return null
  }
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
