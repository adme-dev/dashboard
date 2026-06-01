// workers/audio-jobs/src/index.ts
//
// CF Queue consumer for Audio Studio music generation. The Pages app produces
// to the `music-gen` queue (POST /api/agency/audio/music/generate); this Worker
// consumes, calls the MiniMax music model, fetches the generated track, uploads
// it to R2, and advances the audio_assets row.
//
// Bindings (wrangler.toml): AI, AUDIO_BUCKET (R2, bucket 'agency-files'),
// HYPERDRIVE (→ Neon), and DATABASE_URL secret as a fallback connection string.

import type { MusicJobBody } from './musicWorker'

interface Env {
  AI: { run(model: string, inputs: Record<string, unknown>): Promise<any> }
  AUDIO_BUCKET: R2Bucket
  HYPERDRIVE?: { connectionString: string }
  DATABASE_URL?: string
}

export default {
  async queue(
    batch: MessageBatch<MusicJobBody>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (env.HYPERDRIVE?.connectionString) {
      ;(globalThis as any).__HYPERDRIVE_CS = env.HYPERDRIVE.connectionString
    }
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL

    const { runMusicJob } = await import('./musicWorker')

    for (const msg of batch.messages) {
      try {
        await runMusicJob(msg.body, { AI: env.AI, AUDIO_BUCKET: env.AUDIO_BUCKET })
        msg.ack()
      } catch (e) {
        console.error('audio-jobs.queue.error', msg.body?.assetId, e)
        msg.retry({ delaySeconds: 30 })
      }
    }
  },
}
