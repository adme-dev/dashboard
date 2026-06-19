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
    for (const formatKey of msg.formats) {
      const resolvedOverlays = msg.resolvedOverlaysByFormat?.[formatKey] ?? msg.resolvedOverlays
      const { key } = await deps.renderOne({
        projectId: msg.projectId,
        jobId: msg.jobId,
        state,
        formatKey,
        resolvedOverlays,
      })
      variants[formatKey] = key
    }
    const wallSec = Math.max(1, Math.round((Date.now() - start) / 1000))
    await deps.markDone(msg.jobId, variants, Math.round(wallSec * deps.centsPerSec))
  } catch (e: any) {
    await deps.markFailed(msg.jobId, e?.message ?? String(e))
    throw e
  }
}
