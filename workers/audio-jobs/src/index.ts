// workers/audio-jobs/src/index.ts
//
// CF Queue consumer for Audio Studio music generation + (Phase 3) render.
// The Pages app produces to `music-gen`; this Worker consumes, calls the MiniMax
// music model, uploads the master to R2, then renders per-channel variants via
// the FFmpeg Container (RENDER) bound below.
//
// Bindings (wrangler.toml): AI, AUDIO_BUCKET (R2, 'agency-files'), HYPERDRIVE
// (→ Neon), DATABASE_URL secret, and RENDER (FFmpeg Container).
import { Container } from '@cloudflare/containers'

/** FFmpeg render service — a Linux container running ffmpeg over HTTP. The Worker
 * invokes it per channel (POST /render with the master bytes + an x-audio-profile
 * header); it returns the loudness-normalised variant bytes. Stateless: no R2/DB
 * creds in the container — the Worker owns persistence. */
export class RenderContainer extends Container {
  defaultPort = 8080
  sleepAfter = '5m'
}

interface Env {
  AI: { run(model: string, inputs: Record<string, unknown>): Promise<any> }
  AUDIO_BUCKET: R2Bucket
  RENDER: unknown
  HYPERDRIVE?: { connectionString: string }
  DATABASE_URL?: string
  RENDER_CENTS_PER_SEC?: string
}

export default {
  async queue(
    batch: MessageBatch<any>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (env.HYPERDRIVE?.connectionString) {
      ;(globalThis as any).__HYPERDRIVE_CS = env.HYPERDRIVE.connectionString
    }
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL

    if (batch.queue === 'timeline-render') {
      const { runTimelineRenderJob } = await import('./timelineRenderWorker')
      const { renderVariants } = await import('./renderVariants')
      const { renderTimelineMaster } = await import('./timelineMasterRender')
      const db = await import('./db')
      for (const msg of batch.messages) {
        try {
          await runTimelineRenderJob(msg.body as any, {
            loadTimelineState: db.dbLoadTimelineState,
            markRendering: db.dbMarkRenderRendering,
            markDone: db.dbMarkRenderDone,
            markFailed: db.dbMarkRenderFailed,
            renderMaster: ({ projectId, jobId, state }) =>
              renderTimelineMaster({ RENDER: env.RENDER, AUDIO_BUCKET: env.AUDIO_BUCKET as any }, { projectId, jobId, state }),
            renderVariants: ({ projectId, jobId, masterKey, channels, clientId }) =>
              renderVariants({ RENDER: env.RENDER, AUDIO_BUCKET: env.AUDIO_BUCKET as any },
                { clientId, assetId: `${projectId}/${jobId}`, masterKey, channels }),
            centsPerSec: Number(env.RENDER_CENTS_PER_SEC ?? '2')
          })
          msg.ack()
        } catch (e) {
          console.error('audio-jobs.timeline-render.error', (msg.body as any)?.jobId, e)
          msg.retry({ delaySeconds: 30 })
        }
      }
      return
    }

    const { runMusicJob } = await import('./musicWorker')
    for (const msg of batch.messages) {
      try {
        await runMusicJob(msg.body, { AI: env.AI, AUDIO_BUCKET: env.AUDIO_BUCKET as any, RENDER: env.RENDER })
        msg.ack()
      } catch (e) {
        console.error('audio-jobs.queue.error', msg.body?.assetId, e)
        msg.retry({ delaySeconds: 30 })
      }
    }
  },
}
