import type { StoryboardRenderManifest, PinnedRenderObject } from '../../../shared/video-storyboard/renderManifest'
// workers/audio-jobs/src/videoCompositeRender.ts — orchestrates a video composite
// render job. Collaborators (DB writers, container caller) are injected so the
// control flow is unit-testable without CF bindings / ffmpeg. The real wiring
// lives in index.ts (queue branch) which constructs the deps from env.

export class StoryboardPublicationUncertainError extends Error {}

export interface ResolvedOverlay {
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
  publishApproved(jobId: string, manifestHash: string, variants: Record<string, string>, costCents: number): Promise<void>
  discardOutput(key: string): Promise<void>
  loadTimelineState(timelineId: string): Promise<unknown>
  markRendering(jobId: string): Promise<void>
  /** Optional per-format stage reporting for the editor's render strip. Failures are swallowed. */
  markProgress?(jobId: string, progress: { stage: 'rendering' | 'done', formatKey: string | null, done: number, total: number, updatedAt: string }): Promise<void>
  renderOne(args: { projectId: string, jobId: string, state: unknown, formatKey: string, resolvedOverlays?: ResolvedOverlay[], pinnedObjects?: PinnedRenderObject[] }): Promise<{ key: string }>
  markDone(jobId: string, variants: Record<string, string>, costCents: number | null): Promise<void>
  markFailed(jobId: string, error: string): Promise<void>
  centsPerSec: number
}

export async function runVideoCompositeJob(msg: VideoRenderMessage, deps: VideoRenderDeps): Promise<void> {
  const start = Date.now()
  const variants: Record<string, string> = {}
  try {
    const loaded = await deps.loadRenderInputs(msg)
    if (loaded && 'completed' in loaded) return
    const approved = loaded && 'manifest' in loaded ? loaded : null
    const manifest = approved?.manifest
    if (manifest && (manifest.jobId !== msg.jobId || manifest.projectId !== msg.projectId || manifest.timelineId !== msg.timelineId || JSON.stringify(manifest.formats) !== JSON.stringify(msg.formats)))
      throw new Error('Render manifest identity mismatch')
    if (approved) await deps.checkEligibility(msg.jobId, approved.manifestHash)
    await deps.markRendering(msg.jobId)
    const state = manifest ? manifest.state : await deps.loadTimelineState(msg.timelineId)
    const total = msg.formats.length
    const report = async (stage: 'rendering' | 'done', formatKey: string | null, done: number) => {
      try {
        await deps.markProgress?.(msg.jobId, { stage, formatKey, done, total, updatedAt: new Date(Date.now()).toISOString() })
      } catch { /* progress is advisory — never fail a render over it */ }
    }
    let done = 0
    for (const formatKey of msg.formats) {
      await report('rendering', formatKey, done)
      const resolvedOverlays = manifest ? manifest.resolvedOverlaysByFormat[formatKey] : msg.resolvedOverlaysByFormat?.[formatKey] ?? msg.resolvedOverlays
      const { key } = await deps.renderOne({
        projectId: msg.projectId,
        jobId: msg.jobId,
        state,
        formatKey,
        resolvedOverlays,
        ...(manifest ? { pinnedObjects: manifest.objects } : {})
      })
      variants[formatKey] = key
      done += 1
    }
    const wallSec = Math.max(1, Math.round((Date.now() - start) / 1000))
    const cost = Math.round(wallSec * deps.centsPerSec)
    if (approved) await deps.publishApproved(msg.jobId, approved.manifestHash, variants, cost)
    else await deps.markDone(msg.jobId, variants, cost)
    await report('done', null, done)
  } catch (e) {
    // A lost publish response may already have committed. Retain bytes for retry.
    if (e instanceof StoryboardPublicationUncertainError) throw e
    for (const key of Object.values(variants)) await deps.discardOutput(key).catch(() => {})
    await deps.markFailed(msg.jobId, e instanceof Error ? e.message : String(e))
    throw e
  }
}
