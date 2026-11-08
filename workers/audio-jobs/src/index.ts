// workers/audio-jobs/src/index.ts
//
// CF Queue consumer for Audio Studio music generation + (Phase 3) render.
// The Pages app produces to `music-gen`; this Worker consumes, calls the MiniMax
// music model, uploads the master to R2, then renders per-channel variants via
// the FFmpeg Container (RENDER) bound below.
//
// Bindings (wrangler.toml): AI, AUDIO_BUCKET (R2, 'agency-files'), HYPERDRIVE
// (→ Neon), DATABASE_URL secret, and RENDER (FFmpeg Container).
import { handleCopyMeasurement } from './copyMeasurement'
import { handleMediaProbe } from './mediaProbe'
import { Container } from '@cloudflare/containers'

/** FFmpeg render service — a Linux container running ffmpeg over HTTP. The Worker
 * invokes it per channel (POST /render with the master bytes + an x-audio-profile
 * header); it returns the loudness-normalised variant bytes. Stateless: no R2/DB
 * creds in the container — the Worker owns persistence. */
export class RenderContainer extends Container {
  defaultPort = 8080
  sleepAfter = '30s'
}

interface Env {
  AI: { run(model: string, inputs: Record<string, unknown>): Promise<any> }
  AUDIO_BUCKET: R2Bucket
  RENDER: Parameters<typeof import('@cloudflare/containers').getContainer>[0]
  HYPERDRIVE?: { connectionString: string }
  DATABASE_URL?: string
  STORYBOARD_APP_ORIGIN?: string
  STORYBOARD_RENDER_SECRET?: string
  RENDER_CENTS_PER_SEC?: string
}

export default {
  fetch(request: Request, env: Env) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/measure-copy') return handleCopyMeasurement(request, env)
    return handleMediaProbe(request, env)
  },
  async queue(
    batch: MessageBatch<any>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (env.HYPERDRIVE?.connectionString) {
      ;(globalThis as any).__HYPERDRIVE_CS = env.HYPERDRIVE.connectionString
    }
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL

    if (batch.queue === 'video-render') {
      const { loadStoryboardRenderInputs, callStoryboardRenderAuthority } = await import('./storyboardRenderAuthority')
      const { runVideoCompositeJob } = await import('./videoCompositeRender')
      const { renderComposite } = await import('./videoCompositeContainer')
      const { videoFormatFor } = await import('../container/videoProfiles.mjs')
      const db = await import('./db')
      for (const msg of batch.messages) {
        try {
          await runVideoCompositeJob(msg.body as any, {
            loadRenderInputs: loadStoryboardRenderInputs,
            checkEligibility: (jobId, manifestHash) => callStoryboardRenderAuthority(env, { action: 'check', jobId, manifestHash }),
            publishApproved: (jobId, manifestHash, variants, costCents) => callStoryboardRenderAuthority(env, { action: 'publish', jobId, manifestHash, variants, costCents }),
            discardOutput: key => env.AUDIO_BUCKET.delete(key),
            loadTimelineState: db.dbLoadTimelineState,
            markRendering: db.dbMarkRenderRendering,
            markProgress: db.dbMarkRenderProgress,
            markDone: db.dbMarkRenderDone,
            markFailed: db.dbMarkRenderFailed,
            renderOne: ({ projectId, jobId, state, formatKey, resolvedOverlays, pinnedObjects }) => {
              const profile = videoFormatFor(formatKey)
              if (!profile) throw new Error(`unknown video format: ${formatKey}`)
              return renderComposite({ RENDER: env.RENDER, AUDIO_BUCKET: env.AUDIO_BUCKET as any }, {
                projectId, jobId, state, profile, resolvedOverlays, pinnedObjects
              })
            },
            centsPerSec: Number(env.RENDER_CENTS_PER_SEC ?? '2')
          })
          msg.ack()
        } catch (e) {
          console.error('audio-jobs.video-render.error', (msg.body as any)?.jobId, e)
          msg.retry({ delaySeconds: 30 })
        }
      }
      return
    }

    if (batch.queue === 'banner-render') {
      const { runBannerRenderJob, BannerRenderBusyError, BannerRenderCapacityError } = await import('./bannerRenderWorker')
      const { renderBanner, getSourceHtml, uploadBannerMp4 } = await import('./bannerRenderContainer')
      const db = await import('./db')
      for (const msg of batch.messages) {
        const { jobId } = msg.body as { jobId: string }
        try {
          const completed = await runBannerRenderJob({ jobId }, {
            loadJob: db.dbLoadBannerJob,
            markRendering: db.dbMarkBannerRendering,
            renewLease: db.dbRenewBannerLease,
            getSourceHtml: (key) => getSourceHtml(env as any, key),
            render: (html, p) => renderBanner(env as any, { jobId, html, ...p }),
            uploadMp4: (projectId, formatKey, bytes) => uploadBannerMp4(env as any, projectId, formatKey, bytes, jobId, crypto.randomUUID()),
            discardUpload: (key) => (env.AUDIO_BUCKET as R2Bucket).delete(key),
            markDone: db.dbMarkBannerDone,
            markFailed: db.dbMarkBannerFailed,
            markDeferred: db.dbMarkBannerDeferred,
          })
          // Cleanup source HTML on success only (keep on failure so retries can re-read).
          if (completed) {
            try { await (env.AUDIO_BUCKET as R2Bucket).delete(`banner-render-jobs/${jobId}/source.html`) } catch { /* ignore */ }
          }
          msg.ack()
        } catch (e) {
          console.error('audio-jobs.banner-render.error', jobId, e)
          msg.retry({ delaySeconds: e instanceof BannerRenderBusyError || e instanceof BannerRenderCapacityError ? e.retryAfterSeconds : 30 })
        }
      }
      return
    }

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
            markProgress: db.dbMarkRenderProgress,
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
