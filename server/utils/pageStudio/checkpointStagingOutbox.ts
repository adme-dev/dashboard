import { z } from 'zod'
import { CheckpointStagingRequestSchema } from '~~/shared/pageStudio/checkpointStagingOrigin'

export interface CheckpointStagingDatabase {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}
export const CHECKPOINT_STAGING_BATCH_LIMIT = 3
const Environment = z.enum(['staging', 'production'])
const Claim = z.object({ request: CheckpointStagingRequestSchema, token: z.string().uuid(), attempt: z.number().int().min(1).max(8) }).strict()
export type CheckpointStagingClaim = z.infer<typeof Claim>
const Outcome = z.enum(['READY', 'FAILED', 'SUSPENDED', 'PENDING', 'STAGING_INVALID', 'STAGING_ACCESS_DENIED', 'STAGING_CHANGED', 'STAGING_BUSY', 'STAGING_BUILD_LIMIT', 'STAGING_SERVICE_UNAVAILABLE'])
export type CheckpointStagingOutcome = z.infer<typeof Outcome>

/** Caller owns a fresh, non-retrying transaction. Commit these claims before
 * contacting the service. Expired attempts keep the same immutable identity. */
export async function claimCheckpointStaging(db: CheckpointStagingDatabase, rawEnvironment: unknown, rawLimit: unknown = CHECKPOINT_STAGING_BATCH_LIMIT) {
  const environment = Environment.parse(rawEnvironment)
  const limit = z.number().int().min(1).max(CHECKPOINT_STAGING_BATCH_LIMIT).parse(rawLimit)
  const result = await db.query(`WITH eligible AS (
    SELECT audit_id FROM page_studio_checkpoint_staging_outbox
    WHERE environment=$1 AND ((state='pending' AND available_at<=clock_timestamp())
      OR (state='leased' AND claim_until<=clock_timestamp()))
    ORDER BY available_at,created_at,audit_id LIMIT $2 FOR UPDATE SKIP LOCKED
  ) UPDATE page_studio_checkpoint_staging_outbox work SET
    state=CASE WHEN attempts>=8 THEN 'stopped' ELSE 'leased' END,
    attempts=LEAST(attempts+1,8),
    claim_token=CASE WHEN attempts>=8 THEN NULL ELSE gen_random_uuid() END,
    claim_until=CASE WHEN attempts>=8 THEN NULL ELSE clock_timestamp()+INTERVAL '2 minutes' END,
    outcome=CASE WHEN attempts>=8 THEN 'EXHAUSTED' ELSE outcome END,
    finished_at=CASE WHEN attempts>=8 THEN clock_timestamp() ELSE NULL END
    FROM eligible WHERE work.audit_id=eligible.audit_id
    RETURNING work.audit_id,tenant_id,client_id,site_id,checkpoint_id,checkpoint_digest,environment,state,attempts,claim_token`, [environment, limit])
  const claims: CheckpointStagingClaim[] = []
  let exhausted = 0
  for (const row of result.rows) {
    if (row.state === 'stopped') {
      exhausted++
      continue
    }
    claims.push(Claim.parse({ request: { scope: { tenantId: row.tenant_id, clientId: row.client_id, siteId: row.site_id },
      auditId: row.audit_id, checkpointId: row.checkpoint_id, digest: row.checkpoint_digest, expectedEnvironment: row.environment },
    token: row.claim_token, attempt: row.attempts }))
  }
  return { claims, exhausted }
}

/** Caller owns a fresh, non-retrying transaction spanning both statements.
 * A token alone is insufficient: retain full scope/identity, attempt and a
 * live lease. An expired or replaced caller cannot complete or reschedule work. */
export async function settleCheckpointStaging(db: CheckpointStagingDatabase, rawClaim: CheckpointStagingClaim, rawOutcome: CheckpointStagingOutcome) {
  const claim = Claim.parse(rawClaim), requested = Outcome.parse(rawOutcome)
  const retry = ['PENDING', 'STAGING_BUSY', 'STAGING_SERVICE_UNAVAILABLE'].includes(requested)
  const state = requested === 'READY' ? 'completed' : retry && claim.attempt < 8 ? 'pending' : 'stopped'
  const outcome = retry && claim.attempt >= 8 ? 'EXHAUSTED' : requested
  const delaySeconds = Math.min(60 * 2 ** (claim.attempt - 1), 900)
  const { request } = claim
  const identity = [request.auditId, request.scope.tenantId, request.scope.clientId, request.scope.siteId, request.checkpointId,
    request.digest, request.expectedEnvironment, claim.token, claim.attempt]
  // An UPDATE predicate can be evaluated before waiting on an unchanged row.
  // Acquire its lock first so the second statement checks the clock after wait.
  const locked = await db.query(`SELECT audit_id FROM page_studio_checkpoint_staging_outbox
    WHERE audit_id=$1 AND tenant_id=$2 AND client_id=$3 AND site_id=$4 AND checkpoint_id=$5
      AND checkpoint_digest=$6 AND environment=$7 AND claim_token=$8 AND attempts=$9
      AND state='leased' FOR UPDATE`, identity)
  if (locked.rows.length !== 1) return false
  const result = await db.query(`UPDATE page_studio_checkpoint_staging_outbox SET state=$10,outcome=$11,
    claim_token=NULL,claim_until=NULL,
    available_at=CASE WHEN $10='pending' THEN clock_timestamp()+($12::int*INTERVAL '1 second') ELSE available_at END,
    finished_at=CASE WHEN $10='pending' THEN NULL ELSE clock_timestamp() END
    WHERE audit_id=$1 AND tenant_id=$2 AND client_id=$3 AND site_id=$4 AND checkpoint_id=$5
      AND checkpoint_digest=$6 AND environment=$7 AND claim_token=$8 AND attempts=$9
      AND state='leased' AND claim_until>clock_timestamp() RETURNING audit_id`,
  [...identity, state, outcome, delaySeconds])
  return result.rows.length === 1
}
