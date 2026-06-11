// generationStatusVisibility.ts — PURE filter deciding which generation jobs the
// floating status cards show. Active jobs always show; finished jobs only show
// while they're fresh, so revisiting the editor days later doesn't resurrect a
// stack of historical "Failed" cards.
import type { VideoGenerationJobView } from '~~/app/composables/useVideoGenerationJobs'

/** Finished (succeeded/failed) jobs stay visible this long after completion. */
export const FINISHED_JOB_VISIBILITY_MS = 10 * 60 * 1000

export function visibleGenerationJobs(
  jobs: VideoGenerationJobView[],
  dismissedIds: ReadonlySet<string>,
  nowMs: number,
  limit = 4
): VideoGenerationJobView[] {
  return jobs
    .filter((job) => {
      if (dismissedIds.has(job.id)) return false
      if (job.status === 'queued' || job.status === 'running') return true
      if (job.status !== 'succeeded' && job.status !== 'failed') return false
      const completed = job.completedAt ? Date.parse(job.completedAt) : NaN
      return Number.isFinite(completed) && nowMs - completed < FINISHED_JOB_VISIBILITY_MS
    })
    .slice(0, limit)
}
