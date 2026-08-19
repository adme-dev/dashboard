// workers/audio-jobs/src/musicWorker.ts
// The music-gen job: guard-passed brief → MiniMax music model → fetch the
// generated track → upload master to R2 → (Phase 3) render per-channel variants
// via the FFmpeg container → flip audio_assets to done/failed.
// Kept free of CF-only global types so it's unit-testable under vitest.
import { queryOne, execute, dbRecordAiInvocation } from './db'
import { renderVariants, type RenderEnv } from './renderVariants'

// MiniMax partner models on Workers AI use the bare `provider/model` id — NOT
// the `@cf/...` prefix. `@cf/minimax/music-2.6` returns "5007: No such model".
// Verified live 2026-06-02 against developers.cloudflare.com/ai/models/minimax/
// music-2.6/ (env.AI.run('minimax/music-2.6', ...) → { result: { audio: <URL> } },
// which extractAudioUrl probes below).
export const MUSIC_MODEL = 'minimax/music-2.6'

export interface MusicJobBody {
  assetId: string
  prompt: string
  isInstrumental: boolean
  lyrics: string | null
  format: string
  idempotencyKey: string
}

export interface MusicWorkerEnv extends RenderEnv {
  AI: { run(model: string, inputs: Record<string, unknown>): Promise<any> }
}

/** Pure: the R2 master key for a music asset. Matches the Pages-side
 * buildMasterKey shape so the app's presigner finds it. */
export function masterKey(clientId: string | null, assetId: string, ext: string): string {
  return `audio/${clientId ?? 'org'}/${assetId}/master.${ext}`
}

/** Pure: pull the generated-audio URL out of the (partner) model response,
 * which is not raw bytes. Field name varies — probe the common spots. */
export function extractAudioUrl(result: any): string | null {
  const candidate = result?.audio ?? result?.url ?? result?.output_url ?? result?.audio_url ?? result?.data?.audio ?? result?.result?.audio
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

const MP3_BITRATES: Record<number, Record<number, number[]>> = {
  3: {
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    1: [0, 32, 32, 32, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192],
  },
  2: {
    3: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    1: [0, 8, 8, 8, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112],
  },
  0: {
    3: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    1: [0, 8, 8, 8, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112],
  },
}

const MP3_SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
}

function skipId3v2(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
  const hasFooter = Boolean(bytes[5] & 0x10)
  return 10 + size + (hasFooter ? 10 : 0)
}

function estimateMp3DurationSec(bytes: Uint8Array): number | null {
  let offset = skipId3v2(bytes)
  let samples = 0
  let sampleRate = 0
  let frames = 0

  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
      offset++
      continue
    }

    const version = (bytes[offset + 1] >> 3) & 0x03
    const layer = (bytes[offset + 1] >> 1) & 0x03
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03
    const padding = (bytes[offset + 2] >> 1) & 0x01
    if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      offset++
      continue
    }

    const rates = MP3_SAMPLE_RATES[version]
    const bitrates = MP3_BITRATES[version]?.[layer]
    const rate = rates?.[sampleRateIndex]
    const bitrateKbps = bitrates?.[bitrateIndex]
    if (!rate || !bitrateKbps) {
      offset++
      continue
    }

    const layerI = layer === 3
    const frameLength = layerI
      ? Math.floor(((12 * bitrateKbps * 1000) / rate + padding) * 4)
      : Math.floor(((version === 3 || layer === 2 ? 144 : 72) * bitrateKbps * 1000) / rate + padding)
    if (frameLength <= 4 || offset + frameLength > bytes.length) break

    const samplesPerFrame = layerI ? 384 : (version === 3 || layer === 2 ? 1152 : 576)
    samples += samplesPerFrame
    sampleRate = rate
    frames++
    offset += frameLength
  }

  return frames > 0 && sampleRate > 0 ? samples / sampleRate : null
}

function estimateWavDurationSec(bytes: Uint8Array): number | null {
  if (bytes.length < 44) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
  if (riff !== 'RIFF' || wave !== 'WAVE') return null

  let offset = 12
  let byteRate = 0
  let dataBytes = 0
  while (offset + 8 <= bytes.length) {
    const chunk = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
    const size = view.getUint32(offset + 4, true)
    if (chunk === 'fmt ' && offset + 16 <= bytes.length) byteRate = view.getUint32(offset + 12, true)
    if (chunk === 'data') dataBytes = size
    offset += 8 + size + (size % 2)
  }

  return byteRate > 0 && dataBytes > 0 ? dataBytes / byteRate : null
}

export function estimateAudioDurationSec(bytes: Uint8Array, format: string): number | null {
  const fmt = format.toLowerCase()
  if (fmt === 'mp3' || fmt === 'mpeg') return estimateMp3DurationSec(bytes)
  if (fmt === 'wav' || fmt === 'wave') return estimateWavDurationSec(bytes)
  return null
}

export async function runMusicJob(job: MusicJobBody, env: MusicWorkerEnv): Promise<void> {
  const startedAt = Date.now()
  let modelAttempted = false
  let modelLatencyMs: number | null = null
  let durationSec: number | null = null
  // State/idempotency guard. A redelivered message for a done asset no-ops.
  const row = await queryOne<{ status: string, client_id: string | null, created_by: string | null, channels: string[] | null, r2_key_master: string | null }>(
    `SELECT status, client_id, created_by, channels, r2_key_master FROM audio_assets WHERE id = $1`,
    [job.assetId],
  )
  if (!row) return // asset deleted — nothing to do
  if (row.status === 'done') return

  const ext = job.format || 'mp3'
  let masterR2Key = row.r2_key_master

  try {
    // 1. Generate the master — skipped if one already exists (a render-only
    //    retry must NOT re-call the model and re-bill).
    if (!masterR2Key) {
      await execute(
        `UPDATE audio_assets SET status = 'processing', updated_at = now() WHERE id = $1 AND status <> 'done'`,
        [job.assetId],
      )

      const inputs: Record<string, unknown> = {
        prompt: job.prompt,
        is_instrumental: job.isInstrumental,
        format: ext,
      }
      if (job.lyrics) inputs.lyrics = job.lyrics

      const modelStartedAt = Date.now()
      modelAttempted = true
      const result = await env.AI.run(MUSIC_MODEL, inputs)
      modelLatencyMs = Date.now() - modelStartedAt
      const url = extractAudioUrl(result)
      if (!url) throw new Error('music model returned no audio URL')

      const audioRes = await fetch(url)
      if (!audioRes.ok) throw new Error(`fetch generated audio failed: ${audioRes.status}`)
      const bytes = await audioRes.arrayBuffer()
      durationSec = estimateAudioDurationSec(new Uint8Array(bytes), ext)

      masterR2Key = masterKey(row.client_id, job.assetId, ext)
      await env.AUDIO_BUCKET.put(masterR2Key, bytes, {
        httpMetadata: { contentType: ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}` },
      })
      await execute(
        `UPDATE audio_assets SET r2_key_master = $2, duration_sec = COALESCE($3, duration_sec), updated_at = now() WHERE id = $1`,
        [job.assetId, masterR2Key, durationSec],
      )
    }

    // 2. Render per-channel variants (Phase 3). No channels (or no container) →
    //    the master alone is the deliverable.
    const channels = Array.isArray(row.channels) ? row.channels : []
    if (channels.length && env.RENDER) {
      await execute(
        `UPDATE audio_assets SET status = 'rendering', updated_at = now() WHERE id = $1`,
        [job.assetId],
      )
      const variants = await renderVariants(env, {
        clientId: row.client_id,
        assetId: job.assetId,
        masterKey: masterR2Key,
        channels,
      })
      await execute(
        `UPDATE audio_assets SET variants = $2::jsonb, status = 'done', error = NULL, updated_at = now() WHERE id = $1`,
        [job.assetId, JSON.stringify(variants)],
      )
    } else {
      await execute(
        `UPDATE audio_assets SET status = 'done', error = NULL, updated_at = now() WHERE id = $1`,
        [job.assetId],
      )
    }
    if (modelAttempted) {
      await dbRecordAiInvocation({
        featureKey: 'audio_music_generation_worker_runtime',
        provider: 'workers_ai',
        modelId: MUSIC_MODEL,
        gatewayUsed: true,
        userId: row.created_by ?? null,
        clientId: row.client_id,
        requestId: job.assetId,
        status: 'success',
        latencyMs: modelLatencyMs ?? Date.now() - startedAt,
        metadata: {
          assetId: job.assetId,
          idempotencyKey: job.idempotencyKey,
          outcome: 'succeeded',
          generatedMaster: true,
          format: ext,
          isInstrumental: job.isInstrumental,
          hasLyrics: Boolean(job.lyrics),
          durationSec,
          totalWorkerLatencyMs: Date.now() - startedAt,
        },
      })
    }
  } catch (err: any) {
    await execute(
      `UPDATE audio_assets SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [job.assetId, String(err?.message ?? err).slice(0, 500)],
    )
    if (modelAttempted) {
      await dbRecordAiInvocation({
        featureKey: 'audio_music_generation_worker_runtime',
        provider: 'workers_ai',
        modelId: MUSIC_MODEL,
        gatewayUsed: true,
        userId: row.created_by ?? null,
        clientId: row.client_id,
        requestId: job.assetId,
        status: 'error',
        errorCode: 'audio_music_worker_failed',
        latencyMs: modelLatencyMs ?? Date.now() - startedAt,
        metadata: {
          assetId: job.assetId,
          idempotencyKey: job.idempotencyKey,
          outcome: 'failed',
          generatedMaster: false,
          format: ext,
          errorMessage: String(err?.message ?? err).slice(0, 500),
          totalWorkerLatencyMs: Date.now() - startedAt,
        },
      })
    }
    throw err // surface to the queue runtime → retry, then DLQ (row stays 'failed')
  }
}
