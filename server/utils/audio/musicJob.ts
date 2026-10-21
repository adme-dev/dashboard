// server/utils/audio/musicJob.ts — music-gen queue payload + producer helper.
// The job is consumed by the `audio-jobs` companion Worker (workers/audio-jobs),
// NOT the in-Pages queue hook: the deployed Pages worker exports only fetch +
// scheduled (see scripts/wrap-worker.mjs), so a Pages-side queue consumer never
// fires in prod and can't reach the AI/R2 bindings anyway.
import type { H3Event } from 'h3'
import { createHash } from 'crypto'
import { resolveCreativeClientScope } from '~~/server/utils/ai/creativeClientScope'

export interface MusicJobPayload {
  assetId: string
  prompt: string
  isInstrumental: boolean
  lyrics: string | null
  format: string
  idempotencyKey: string
}

/** Minimal Queue producer interface (matches Cloudflare Queue binding). */
interface QueueProducer {
  send(message: any, options?: { contentType?: string }): Promise<void>
}

/** Get the MUSIC_QUEUE producer from the event context, or null when the binding
 * is unavailable (local dev / not yet provisioned). Never throws. */
export function getMusicQueue(event: H3Event): QueueProducer | null {
  try {
    const queue = (event.context as any).cloudflare?.env?.MUSIC_QUEUE
    return queue && typeof queue.send === 'function' ? queue as QueueProducer : null
  } catch {
    return null
  }
}

/** Deterministic idempotency key — the same brief from the same user maps to the
 * same key, so a double-submit collides on the audio_assets.idempotency_key
 * UNIQUE constraint instead of generating (and billing) twice. */
export function musicIdempotencyKey(parts: {
  clientScope?: string
  createdBy: string
  prompt: string
  isInstrumental: boolean
  lyrics: string | null
}): string {
  const scope = resolveCreativeClientScope({ clientScope: parts.clientScope })
  const h = createHash('sha256')
  if (scope) h.update(JSON.stringify(['client-scoped-music-v1', scope]) + '\u0000')
  h.update([
    parts.createdBy,
    parts.prompt,
    parts.isInstrumental ? '1' : '0',
    parts.lyrics ?? ''
  ].join('\u0000'))
  return `music:${h.digest('hex').slice(0, 32)}`
}
