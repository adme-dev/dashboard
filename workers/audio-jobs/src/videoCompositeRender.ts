import type { ReelmotionBaseFootage } from '../../../shared/reelmotionBaseFootage'
import type { StoryboardRenderManifest, PinnedRenderObject } from '../../../shared/video-storyboard/renderManifest'
import { createRenderDeadline, VIDEO_RENDER_WORK_MS, VIDEO_PROGRESS_REQUEST_MS, RenderPublicationUncertainError, type MeasuredRenderProgress, type VideoRenderProgress } from '../../../shared/video/renderExecution'
// workers/audio-jobs/src/videoCompositeRender.ts — orchestrates a video composite
// render job. Collaborators (DB writers, container caller) are injected so the
// control flow is unit-testable without CF bindings / ffmpeg. The real wiring
// lives in index.ts (queue branch) which constructs the deps from env.

export { RenderPublicationUncertainError } from '../../../shared/video/renderExecution'
export class StoryboardPublicationUncertainError extends RenderPublicationUncertainError {}

export interface ResolvedOverlay {
  baseFootage?: ReelmotionBaseFootage
  clipId: string
  htmlKey: string // R2 key for the uploaded banner HTML
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
  /** Mandatory DB authority: null means a verified non-storyboard job. */
  loadRenderInputs(msg: VideoRenderMessage): Promise<{ manifest: StoryboardRenderManifest, manifestHash: string } | { completed: true } | null>
  checkEligibility(jobId: string, manifestHash: string): Promise<void>
  publishApproved(jobId: string, manifestHash: string, variants: Record<string, string>, costCents: number, attemptId?: string): Promise<void>
  discardOutput(key: string): Promise<void>
  loadTimelineState(timelineId: string): Promise<unknown>
  markRendering(jobId: string, attemptId?: string): Promise<void>
  /** Optional per-format stage reporting for the editor's render strip. Failures are swallowed. */
  markProgress?(jobId: string, progress: VideoRenderProgress): Promise<void>
  renderOne(args: { projectId: string, jobId: string, state: unknown, formatKey: string, resolvedOverlays?: ResolvedOverlay[], pinnedObjects?: PinnedRenderObject[], signal: AbortSignal, deadlineAtMs: number, onProgress(progress: MeasuredRenderProgress): Promise<void> }): Promise<{ key: string }>
  markDone(jobId: string, variants: Record<string, string>, costCents: number | null, attemptId?: string): Promise<void>
  markFailed(jobId: string, error: string, attemptId?: string): Promise<void>
  centsPerSec: number
}

export async function runVideoCompositeJob(msg: VideoRenderMessage, deps: VideoRenderDeps): Promise<void> {
  const start = Date.now()
  const budget = createRenderDeadline(VIDEO_RENDER_WORK_MS)
  const attemptId = crypto.randomUUID()
  let closed = false
  const variants: Record<string, string> = {}
  try {
    const loaded = await budget.run(() => deps.loadRenderInputs(msg))
    if (loaded && 'completed' in loaded) return
    const approved = loaded && 'manifest' in loaded ? loaded : null
    const manifest = approved?.manifest
    if (manifest && (manifest.jobId !== msg.jobId || manifest.projectId !== msg.projectId || manifest.timelineId !== msg.timelineId || JSON.stringify(manifest.formats) !== JSON.stringify(msg.formats)))
      throw new Error('Render manifest identity mismatch')
    if (approved) await budget.run(() => deps.checkEligibility(msg.jobId, approved.manifestHash))
    await budget.run(() => deps.markRendering(msg.jobId, attemptId))
    const state = manifest ? manifest.state : await budget.run(() => deps.loadTimelineState(msg.timelineId))
    const total = msg.formats.length
    let sequence = 0
    const report = async (measured: MeasuredRenderProgress, formatKey: string | null, done: number) => {
      if (closed || budget.signal.aborted || !deps.markProgress) return
      const advisory = createRenderDeadline(VIDEO_PROGRESS_REQUEST_MS, { signal: budget.signal })
      try {
        await advisory.run(() => deps.markProgress!(msg.jobId, { ...measured, attemptId, sequence: ++sequence, formatKey, done, total, updatedAt: new Date().toISOString() }))
      } catch { /* progress is advisory — never fail a render over it */ }
      finally { advisory.dispose() }
    }
    let done = 0
    for (const formatKey of msg.formats) {
      budget.signal.throwIfAborted()
      await report({ stage: 'rendering' }, formatKey, done)
      const resolvedOverlays = manifest ? manifest.resolvedOverlaysByFormat[formatKey] : msg.resolvedOverlaysByFormat?.[formatKey] ?? msg.resolvedOverlays
      const { key } = await budget.run(() => deps.renderOne({
        projectId: msg.projectId,
        jobId: msg.jobId,
        state,
        formatKey,
        resolvedOverlays,
        signal: budget.signal,
        deadlineAtMs: budget.deadlineAtMs,
        onProgress: progress => report(progress, formatKey, done),
        ...(manifest ? { pinnedObjects: manifest.objects } : {})
      }), output => deps.discardOutput(output.key))
      variants[formatKey] = key
      budget.signal.throwIfAborted()
      done += 1
    }
    const wallSec = Math.max(1, Math.round((Date.now() - start) / 1000))
    const cost = Math.round(wallSec * deps.centsPerSec)
    try {
      if (approved) await budget.run(() => deps.publishApproved(msg.jobId, approved.manifestHash, variants, cost, attemptId))
      else await budget.run(() => deps.markDone(msg.jobId, variants, cost, attemptId))
    } catch (error) {
      if (budget.signal.aborted) throw new RenderPublicationUncertainError('Render publication response unavailable')
      throw error
    }
    await report({ stage: 'done' }, null, done)
  } catch (e) {
    // A lost publish response may already have committed. Retain bytes for retry.
    closed = true
    if (e instanceof RenderPublicationUncertainError) throw e
    const cleanup = createRenderDeadline(30_000)
    try {
      await cleanup.run(async () => {
        await Promise.allSettled(Object.values(variants).map(key => deps.discardOutput(key)))
        await deps.markFailed(msg.jobId, e instanceof Error ? e.message : String(e), attemptId)
      })
    } catch { /* retain the original failure for queue retry if status persistence is unavailable */ }
    finally { cleanup.dispose() }
    throw e
  } finally {
    closed = true
    budget.dispose()
  }
}
