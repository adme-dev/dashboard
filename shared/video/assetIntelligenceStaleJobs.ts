// Asset intelligence jobs that will never finish.
//
// A job normally runs in well under a minute and the queue retries a failed
// delivery within about a minute. When every delivery dies before it can record
// a failure (the worker is down, or the message went to the dead-letter queue),
// the row stays "queued" or "running" and the editor would show it as working
// forever. Past these ages nothing is still going to pick the job up.
//
// Used by the Pages app (when it lists a project's jobs) and by the queue worker
// (at the start of each delivery), so a stranded job is closed whichever runs next.

export const STALE_RUNNING_JOB_MINUTES = 10
export const STALE_QUEUED_JOB_MINUTES = 15

export const STALE_RUNNING_JOB_MESSAGE = 'This job stopped before it finished and was closed. Nothing was changed. Run it again.'
export const STALE_QUEUED_JOB_MESSAGE = 'This job was never picked up and was closed. Nothing was changed. Run it again.'

/**
 * Marks stale jobs failed and returns their ids.
 * $1 project id, or null for every project. $2/$3 running/queued age limits in minutes.
 * $4/$5 the messages stored on the job.
 */
export const FAIL_STALE_ASSET_INTELLIGENCE_JOBS_SQL = `
  UPDATE video_asset_intelligence_jobs
     SET status = 'failed',
         error_message = CASE WHEN status = 'running' THEN $4::text ELSE $5::text END,
         completed_at = now(),
         updated_at = now()
   WHERE ($1::uuid IS NULL OR project_id = $1::uuid)
     AND (
       (status = 'running' AND updated_at < now() - MAKE_INTERVAL(mins => $2::int))
       OR (status = 'queued' AND created_at < now() - MAKE_INTERVAL(mins => $3::int))
     )
  RETURNING id`

export function staleAssetIntelligenceJobParams(projectId: string | null): [string | null, number, number, string, string] {
  return [projectId, STALE_RUNNING_JOB_MINUTES, STALE_QUEUED_JOB_MINUTES, STALE_RUNNING_JOB_MESSAGE, STALE_QUEUED_JOB_MESSAGE]
}
