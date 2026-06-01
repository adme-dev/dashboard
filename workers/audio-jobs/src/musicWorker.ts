// workers/audio-jobs/src/musicWorker.ts
// The music-gen job: guard-passed brief → MiniMax music model → fetch the
// generated track → upload master to R2 → flip audio_assets to done/failed.
// Kept free of CF-only global types so it's unit-testable under vitest.
import { queryOne, execute } from './db'

// ⚠️ VERIFY at deploy: exact AI.run string for the MiniMax music model on
// Workers AI (doc path is `minimax/music-2.6`; partner models are typically
// addressed `@cf/<provider>/<model>`). And confirm the response field carrying
// the audio URL — we probe the common shapes below.
export const MUSIC_MODEL = '@cf/minimax/music-2.6'

export interface MusicJobBody {
  assetId: string
  prompt: string
  isInstrumental: boolean
  lyrics: string | null
  format: string
  idempotencyKey: string
}

export interface MusicWorkerEnv {
  AI: { run(model: string, inputs: Record<string, unknown>): Promise<any> }
  AUDIO_BUCKET: {
    put(key: string, body: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  }
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

export async function runMusicJob(job: MusicJobBody, env: MusicWorkerEnv): Promise<void> {
  // State/idempotency guard: act only on a not-yet-done row. A redelivered
  // message for an already-completed asset no-ops.
  const row = await queryOne<{ status: string, client_id: string | null }>(
    `SELECT status, client_id FROM audio_assets WHERE id = $1`,
    [job.assetId],
  )
  if (!row) return // asset deleted — nothing to do
  if (row.status === 'done') return

  await execute(
    `UPDATE audio_assets SET status = 'processing', updated_at = now() WHERE id = $1 AND status <> 'done'`,
    [job.assetId],
  )

  try {
    const inputs: Record<string, unknown> = {
      prompt: job.prompt,
      is_instrumental: job.isInstrumental,
      format: job.format || 'mp3',
    }
    if (job.lyrics) inputs.lyrics = job.lyrics

    const result = await env.AI.run(MUSIC_MODEL, inputs)
    const url = extractAudioUrl(result)
    if (!url) throw new Error('music model returned no audio URL')

    const audioRes = await fetch(url)
    if (!audioRes.ok) throw new Error(`fetch generated audio failed: ${audioRes.status}`)
    const bytes = await audioRes.arrayBuffer()

    const ext = job.format || 'mp3'
    const key = masterKey(row.client_id, job.assetId, ext)
    await env.AUDIO_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}` },
    })

    await execute(
      `UPDATE audio_assets SET status = 'done', r2_key_master = $2, updated_at = now() WHERE id = $1`,
      [job.assetId, key],
    )
  } catch (err: any) {
    await execute(
      `UPDATE audio_assets SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [job.assetId, String(err?.message ?? err).slice(0, 500)],
    )
    throw err // surface to the queue runtime → retry, then DLQ (row stays 'failed')
  }
}
