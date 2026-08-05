import type { H3Event } from 'h3'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'
import { resolveAiModelAssignment } from '~~/server/utils/ai/modelAssignments'

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
  return getAI(event) !== null && resolveWorkersAiGatewayId(event) !== null
}

export function resolveWorkersAiGatewayId(event: H3Event): string | null {
  const configured = (event.context as any)?.cloudflare?.env?.AI_GATEWAY_URL
    ?? process.env.AI_GATEWAY_URL
  if (typeof configured !== 'string' || !configured.trim()) return null
  try {
    const url = new URL(configured)
    const parts = url.pathname.split('/').filter(Boolean)
    const id = parts[0] === 'v1' && parts.length >= 3 ? (parts[2] ?? '') : ''
    return url.hostname === 'gateway.ai.cloudflare.com' && /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : null
  } catch {
    return null
  }
}

/**
 * Speech-to-text using OpenAI Whisper Large V3 Turbo via Workers AI.
 * Input audio is base64-encoded for the model.
 * Returns transcribed text or null on failure.
 */
export async function speechToText(
  event: H3Event,
  audioBuffer: ArrayBuffer | Uint8Array,
  options: {
    featureKey?: string
    userId?: string | null
    clientId?: string | null
    requestId?: string | null
    metadata?: Record<string, unknown>
  } = {}
): Promise<{ text: string; durationMs: number } | null> {
  const ai = getAI(event)
  if (!ai) return null
  const gatewayId = resolveWorkersAiGatewayId(event)
  if (!gatewayId) return null

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
    const assignment = await resolveAiModelAssignment({
      featureKey: options.featureKey ?? 'workers_ai_speech_to_text',
      defaultProvider: 'workers_ai',
      defaultModelId: '@cf/openai/whisper-large-v3-turbo',
      supportedProviders: ['workers_ai'],
    })
    const result = await ai.run(assignment.modelId, {
      audio: base64Audio,
    }, {
      gateway: {
        id: gatewayId,
        metadata: { featureKey: options.featureKey ?? 'workers_ai_speech_to_text' },
      },
    })
    const durationMs = Date.now() - start

    const text = result?.text?.trim() || result?.vtt?.replace(/WEBVTT\n\n[\d:.]+ --> [\d:.]+\n/g, '').trim() || ''
    if (!text) return null
    await recordAiInvocation({
      featureKey: options.featureKey ?? 'workers_ai_speech_to_text',
      provider: 'workers_ai',
      modelId: assignment.modelId,
      gatewayUsed: true,
      fallbackUsed: false,
      userId: options.userId,
      clientId: options.clientId,
      requestId: options.requestId,
      status: 'success',
      latencyMs: durationMs,
      metadata: {
        inputBytes: bytes.byteLength,
        modelAssignmentSource: assignment.source,
        modelAssignmentIgnoredReason: assignment.ignoredReason,
        ...(options.metadata ?? {}),
      },
    })

    return { text, durationMs }
  } catch (err) {
    console.error('[aiVoice] STT failed:', err)
    await recordAiInvocation({
      featureKey: options.featureKey ?? 'workers_ai_speech_to_text',
      provider: 'workers_ai',
      modelId: '@cf/openai/whisper-large-v3-turbo',
      gatewayUsed: true,
      fallbackUsed: false,
      status: 'error',
      errorCode: err instanceof Error ? err.message.slice(0, 160) : 'unknown_error',
      metadata: options.metadata ?? {},
    })
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
  options: {
    lang?: string
    featureKey?: string
    userId?: string | null
    clientId?: string | null
    requestId?: string | null
    metadata?: Record<string, unknown>
    beforeDispatch?: () => Promise<void>
  } = {}
): Promise<{ audioBuffer: ArrayBuffer; format: string } | null> {
  const ai = getAI(event)
  if (!ai) return null
  const gatewayId = resolveWorkersAiGatewayId(event)
  if (!gatewayId) return null

  try {
    // Strip markdown for cleaner speech
    const cleanText = stripMarkdown(text)
    if (!cleanText || cleanText.length < 2) return null

    // Truncate to avoid excessive TTS cost (max ~2000 chars)
    const truncated = cleanText.length > 2000
      ? cleanText.slice(0, 1997) + '...'
      : cleanText

    // MeloTTS uses `prompt` (not `text`) and `lang` parameters
    const assignment = await resolveAiModelAssignment({
      featureKey: options.featureKey ?? 'workers_ai_text_to_speech',
      defaultProvider: 'workers_ai',
      defaultModelId: '@cf/myshell-ai/melotts',
      supportedProviders: ['workers_ai'],
    })
    await options.beforeDispatch?.()
    const result = await ai.run(assignment.modelId, {
      prompt: truncated,
      lang: options.lang || 'en',
    }, {
      gateway: {
        id: gatewayId,
        metadata: { featureKey: options.featureKey ?? 'workers_ai_text_to_speech' },
      },
    })

    if (!result) return null

    // Primary shape: Workers AI returns base64-encoded audio in a JSON object,
    // i.e. { audio: "<base64>" } — NOT raw bytes or a stream. (Verified live
    // against @cf/myshell-ai/melotts, 2026-06-02; the bytes are a WAV.) Decode it.
    if (typeof result === 'object' && typeof (result as any).audio === 'string' && (result as any).audio.length > 0) {
      const bytes = Buffer.from((result as any).audio, 'base64')
      if (!bytes.byteLength) return null
      const audioBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      const format = detectAudioFormat(bytes)
      await recordAiInvocation({
        featureKey: options.featureKey ?? 'workers_ai_text_to_speech',
        provider: 'workers_ai',
        modelId: assignment.modelId,
        gatewayUsed: true,
        fallbackUsed: false,
        userId: options.userId,
        clientId: options.clientId,
        requestId: options.requestId,
        status: 'success',
        metadata: {
          outputBytes: bytes.byteLength,
          outputFormat: format,
          lang: options.lang || 'en',
          modelAssignmentSource: assignment.source,
          modelAssignmentIgnoredReason: assignment.ignoredReason,
          ...(options.metadata ?? {}),
        },
      })
      return { audioBuffer, format }
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
        const format = detectAudioFormat(merged)
        await recordAiInvocation({
          featureKey: options.featureKey ?? 'workers_ai_text_to_speech',
          provider: 'workers_ai',
          modelId: assignment.modelId,
          gatewayUsed: true,
          fallbackUsed: false,
          status: 'success',
          metadata: {
            outputBytes: totalLength,
            outputFormat: format,
            lang: options.lang || 'en',
            modelAssignmentSource: assignment.source,
            modelAssignmentIgnoredReason: assignment.ignoredReason,
            ...(options.metadata ?? {}),
          },
        })
        return { audioBuffer: merged.buffer.slice(0, totalLength), format }
      } finally {
        reader.releaseLock()
      }
    }

    // Fallback: raw ArrayBuffer / typed-array.
    if ((result as any).byteLength) {
      const bytes = result instanceof Uint8Array ? result : new Uint8Array(result as ArrayBuffer)
      const format = detectAudioFormat(bytes)
      await recordAiInvocation({
        featureKey: options.featureKey ?? 'workers_ai_text_to_speech',
        provider: 'workers_ai',
        modelId: assignment.modelId,
        gatewayUsed: true,
        fallbackUsed: false,
        status: 'success',
        metadata: {
          outputBytes: bytes.byteLength,
          outputFormat: format,
          lang: options.lang || 'en',
          modelAssignmentSource: assignment.source,
          modelAssignmentIgnoredReason: assignment.ignoredReason,
          ...(options.metadata ?? {}),
        },
      })
      return { audioBuffer: result as ArrayBuffer, format }
    }

    return null
  } catch (err) {
    console.error('[aiVoice] TTS failed:', err)
    await recordAiInvocation({
      featureKey: options.featureKey ?? 'workers_ai_text_to_speech',
      provider: 'workers_ai',
      modelId: '@cf/myshell-ai/melotts',
      gatewayUsed: true,
      status: 'error',
      errorCode: err instanceof Error ? err.message.slice(0, 160) : 'unknown_error',
      metadata: options.metadata ?? {},
    })
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
