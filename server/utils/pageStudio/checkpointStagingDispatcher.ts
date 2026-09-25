import { CheckpointStagingServiceError, requestCheckpointStaging } from '~~/server/utils/pageStudio/checkpointStagingClient'
import {
  CHECKPOINT_STAGING_BATCH_LIMIT, claimCheckpointStaging, settleCheckpointStaging,
  type CheckpointStagingClaim, type CheckpointStagingDatabase, type CheckpointStagingOutcome
} from '~~/server/utils/pageStudio/checkpointStagingOutbox'

// Claims last two minutes. Leave time for the separate acknowledgement after
// a slow build; a timed-out RPC may still finish and is reconciled on retry.
export const CHECKPOINT_STAGING_RPC_TIMEOUT_MS = 90_000
interface Dependencies {
  transaction<T>(work: (db: CheckpointStagingDatabase) => Promise<T>): Promise<T>
}

async function execute(claim: CheckpointStagingClaim, env: Record<string, unknown>): Promise<CheckpointStagingOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const state = await Promise.race([
      requestCheckpointStaging(claim.request, env),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new CheckpointStagingServiceError('STAGING_SERVICE_UNAVAILABLE')), CHECKPOINT_STAGING_RPC_TIMEOUT_MS)
      })
    ])
    switch (state.status) {
      case 'ready':
        return state.active?.checkpointId === claim.request.checkpointId && state.active.digest === claim.request.digest ? 'READY' : 'STAGING_CHANGED'
      case 'failed':
      case 'update_failed':
        return 'FAILED'
      case 'suspended':
        return 'SUSPENDED'
      default:
        return 'PENDING'
    }
  } catch (error) {
    return error instanceof CheckpointStagingServiceError ? error.code : 'STAGING_SERVICE_UNAVAILABLE'
  } finally {
    clearTimeout(timer)
  }
}

/** The caller supplies fresh, non-retrying transactions. An uncertain claim
 * commit must never trigger RPC. An uncertain settlement leaves its lease for
 * recovery, without a second call or acknowledgement in this invocation. */
export async function dispatchCheckpointStaging(env: Record<string, unknown>, dependencies: Dependencies) {
  const environment = env.PAGE_STUDIO_RELEASE_ENVIRONMENT
  const service = env.PAGE_STUDIO_MANAGEMENT as { checkpointStaging?: unknown } | undefined
  if ((environment !== 'staging' && environment !== 'production') || typeof service?.checkpointStaging !== 'function') {
    throw new CheckpointStagingServiceError('STAGING_SERVICE_UNAVAILABLE')
  }
  const { claims, exhausted } = await dependencies.transaction(db => claimCheckpointStaging(db, environment, CHECKPOINT_STAGING_BATCH_LIMIT))
  const counts = { claimed: claims.length, completed: 0, stopped: 0, rescheduled: 0, unsettled: 0, exhausted }
  // Parallelism is bounded by the database claim limit, so later claims do not
  // spend their leases waiting behind another customer's provider request.
  await Promise.all(claims.map(async (claim) => {
    const outcome = await execute(claim, env)
    let acknowledged = false
    try {
      acknowledged = await dependencies.transaction(db => settleCheckpointStaging(db, claim, outcome))
    } catch {
      // The commit may have succeeded: retain uncertainty instead of retrying.
    }
    if (!acknowledged) counts.unsettled++
    else if (outcome === 'READY') counts.completed++
    else if (['PENDING', 'STAGING_BUSY', 'STAGING_SERVICE_UNAVAILABLE'].includes(outcome) && claim.attempt < 8) counts.rescheduled++
    else counts.stopped++
  }))
  return counts
}
