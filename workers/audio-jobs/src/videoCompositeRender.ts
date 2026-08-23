// workers/audio-jobs/src/videoCompositeRender.ts — orchestrates a video composite
// render job. Collaborators (DB writers, container caller) are injected so the
// control flow is unit-testable without CF bindings / ffmpeg. The real wiring
// lives in index.ts (queue branch) which constructs the deps from env.

export interface ResolvedOverlay {
  clipId: string
  htmlKey: string               // R2 key for the uploaded banner HTML
  timeline_start_sec: number
  duration_sec: number
}

export interface VideoRenderMessage {
  jobId: string
  projectId: string
  timelineId: string
  formats: string[]
  resolvedOverlaysByFormat?: Record<string, ResolvedOverlay[]>
  /** Legacy V1.2b payload shape. Keep as a fallback for messages already in the queue. */
  resolvedOverlays?: ResolvedOverlay[]
}

export interface VideoRenderDeps {
  loadTimelineState(timelineId: string): Promise<any>
  markRendering(jobId: string): Promise<void>
  /** Optional per-format stage reporting for the editor's render strip. Failures are swallowed. */
  markProgress?(jobId: string, progress: { stage: 'rendering' | 'done'; formatKey: string | null; done: number; total: number; updatedAt: string }): Promise<void>
  renderOne(args: { projectId: string; jobId: string; state: any; formatKey: string; resolvedOverlays?: ResolvedOverlay[] }): Promise<{ key: string }>
  markDone(jobId: string, variants: Record<string, string>, costCents: number | null): Promise<void>
  markFailed(jobId: string, error: string): Promise<void>
  centsPerSec: number
}

export async function runVideoCompositeJob(msg: VideoRenderMessage, deps: VideoRenderDeps): Promise<void> {
  const start = Date.now()
  try {
    await deps.markRendering(msg.jobId)
    const state = await deps.loadTimelineState(msg.timelineId)
    const variants: Record<string, string> = {}
    const total = msg.formats.length
    const report = async (stage: 'rendering' | 'done', formatKey: string | null, done: number) => {
      try {
        await deps.markProgress?.(msg.jobId, { stage, formatKey, done, total, updatedAt: new Date(Date.now()).toISOString() })
      } catch { /* progress is advisory — never fail a render over it */ }
    }
    let done = 0
    for (const formatKey of msg.formats) {
      await report('rendering', formatKey, done)
      const resolvedOverlays = msg.resolvedOverlaysByFormat?.[formatKey] ?? msg.resolvedOverlays
      const { key } = await deps.renderOne({
        projectId: msg.projectId,
        jobId: msg.jobId,
        state,
        formatKey,
        resolvedOverlays,
      })
      variants[formatKey] = key
      done += 1
    }
    await report('done', null, done)
    const wallSec = Math.max(1, Math.round((Date.now() - start) / 1000))
    await deps.markDone(msg.jobId, variants, Math.round(wallSec * deps.centsPerSec))
  } catch (e: any) {
    await deps.markFailed(msg.jobId, e?.message ?? String(e))
    throw e
  }
}
