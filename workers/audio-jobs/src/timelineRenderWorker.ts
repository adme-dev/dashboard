// workers/audio-jobs/src/timelineRenderWorker.ts — orchestrates a timeline-render
// job. Collaborators (DB writers, master render, variant render) are injected so the
// control flow is unit-testable without CF bindings / ffmpeg. The real wiring lives
// in index.ts (queue branch) which constructs the deps from env.
import type { TimelineRenderMessage } from '../../../server/utils/audio/renderQueue'

export interface RenderJobDeps {
  loadTimelineState(timelineId: string): Promise<any>
  markRendering(jobId: string): Promise<void>
  renderMaster(args: { projectId: string; jobId: string; state: any }): Promise<{ masterKey: string; wallClockSec: number }>
  renderVariants(args: { projectId: string; jobId: string; masterKey: string; channels: string[]; clientId: string | null }): Promise<Record<string, string>>
  markDone(jobId: string, variants: Record<string, string>, costCents: number | null): Promise<void>
  markFailed(jobId: string, error: string): Promise<void>
  centsPerSec: number
  clientId?: string | null
}

export async function runTimelineRenderJob(msg: TimelineRenderMessage, deps: RenderJobDeps): Promise<void> {
  try {
    await deps.markRendering(msg.jobId)
    const state = await deps.loadTimelineState(msg.timelineId)
    const { masterKey, wallClockSec } = await deps.renderMaster({ projectId: msg.projectId, jobId: msg.jobId, state })
    const variants = await deps.renderVariants({
      projectId: msg.projectId, jobId: msg.jobId, masterKey, channels: msg.channels, clientId: deps.clientId ?? null
    })
    const costCents = Math.round(wallClockSec * deps.centsPerSec)
    await deps.markDone(msg.jobId, variants, costCents)
  } catch (e: any) {
    const message = e?.message ?? String(e)
    await deps.markFailed(msg.jobId, message)
    throw e // rethrow so the queue retries
  }
}
