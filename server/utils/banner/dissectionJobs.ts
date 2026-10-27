import { randomUUID, createHash } from 'node:crypto'
import { createError } from 'h3'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import type { DissectorManifest } from '~~/app/types/banner-studio'

export const MAX_DISSECTION_ATTEMPTS = 3
export const DISSECTION_ATTEMPT_TIMEOUT_MS = 10 * 60 * 1000
export const DISSECTION_DISPATCH_LEASE_SECONDS = 60
export const DISSECTION_DISPATCH_BACKOFF_SECONDS = 15
export const DISSECTION_DISPATCH_MAX_BACKOFF_SECONDS = 120
export const MAX_DISSECTION_DISPATCH_SENDS = 5
export const DISSECTION_RECOVERY_BATCH_SIZE = 20
export interface DissectionDispatch {
  version: 1
  deliveryId: string
  state: 'pending' | 'leased' | 'acknowledged' | 'uncertain'
  sendCount: number
  leaseToken: string | null
  leaseUntil: string | null
  nextAttemptAt: string
  lastSentAt: string | null
  acknowledgedAt: string | null
}
export interface DissectionExecution {
  attemptId: string
  attempt: number
  maxAttempts: number
  stage: string
  startedAt: string | null
  updatedAt: string
  deadlineAt?: string
  finishedAt?: string
  completed?: number
  total?: number
  resultId?: string
  dispatchState?: 'reserved' // Legacy metadata is never eligible for autonomous recovery.
  dispatch?: DissectionDispatch
}
export interface DissectionRecord {
  job_id: string
  status: string
  source_r2_key?: string
  brand?: string
  manifest?: Partial<DissectorManifest> & { execution?: DissectionExecution, importReceipt?: unknown } | null
  error?: string | null
  created_at?: string
  updated_at?: string
  project_id?: string | null
}
export interface DissectionAttemptOptions { retry?: boolean, attemptId?: string, userId?: string }

export function queuedDissectionManifest(attemptId = randomUUID()) {
  const now = new Date().toISOString()
  return { execution: { attemptId, attempt: 1, maxAttempts: MAX_DISSECTION_ATTEMPTS, stage: 'queued', startedAt: null, updatedAt: now, deadlineAt: new Date(Date.parse(now) + DISSECTION_ATTEMPT_TIMEOUT_MS).toISOString(), completed: 0, total: 0,
    dispatch: { version: 1, deliveryId: randomUUID(), state: 'pending', sendCount: 0, leaseToken: null, leaseUntil: null, nextAttemptAt: now, lastSentAt: null, acknowledgedAt: null }
  } satisfies DissectionExecution }
}

/** Poll/process admission expires abandoned work; expiry never starts another provider attempt. */
export async function expireDissectionAttempt(jobId: string, userId?: string) {
  return await queryOneFresh(
    `UPDATE banner_dissections /* expire dissection */ SET status = 'failed',
       error = 'Dissection attempt timed out. Retry explicitly after reviewing provider availability.',
       manifest = jsonb_set(COALESCE(manifest, '{}'::jsonb), '{execution}',
         COALESCE(manifest->'execution', '{}'::jsonb) || jsonb_build_object('stage', 'failed', 'updatedAt', $3::text, 'finishedAt', $3::text)), updated_at = NOW()
     WHERE job_id = $1 AND ($2::uuid IS NULL OR user_id = $2::uuid)
       AND status IN ('queued', 'analyzing', 'segmenting')
       AND COALESCE((manifest->'execution'->>'deadlineAt')::timestamptz, updated_at + interval '10 minutes') <= clock_timestamp()
     RETURNING job_id`,
    [jobId, userId || null, new Date().toISOString()]
  )
}

export async function loadDissection(jobId: string, userId?: string): Promise<DissectionRecord> {
  await expireDissectionAttempt(jobId, userId)
  const row = await queryOneFresh<DissectionRecord>(
    `SELECT * FROM banner_dissections WHERE job_id = $1${userId ? ' AND user_id = $2' : ''}`,
    userId ? [jobId, userId] : [jobId]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Dissection job not found' })
  return row
}

/** Reserve a new generation before dispatch; repeated requests must name the old generation. */
export async function prepareDissectionRetry(jobId: string, userId: string, expectedAttemptId: string) {
  await expireDissectionAttempt(jobId, userId)
  const manifest = queuedDissectionManifest()
  return await queryOneFresh<DissectionRecord>(
    `UPDATE banner_dissections SET status = 'queued', error = NULL,
       manifest = jsonb_build_object('execution', $4::jsonb || jsonb_build_object(
         'attempt', COALESCE((manifest->'execution'->>'attempt')::int, 1) + 1,
         'updatedAt', clock_timestamp(), 'deadlineAt', clock_timestamp() + interval '10 minutes',
         'dispatch', ($4::jsonb)->'dispatch' || jsonb_build_object('nextAttemptAt', clock_timestamp()))), updated_at = NOW()
     WHERE job_id = $1 AND user_id = $2::uuid
       AND COALESCE(manifest->'execution'->>'attemptId', 'legacy:' || job_id) = $3
       AND status IN ('failed', 'cancelled', 'review_ready')
       AND COALESCE((manifest->'execution'->>'attempt')::int, 1) < $5
     RETURNING *`,
    [jobId, userId, expectedAttemptId, JSON.stringify(manifest.execution), MAX_DISSECTION_ATTEMPTS]
  )
}

/** Unknown legacy dispatch metadata is deliberately not inferred or upgraded here. */
function dispatchEligible(prefix = '') {
  const m = `${prefix}manifest`
  return `${prefix}status = 'queued'
    AND CASE WHEN ${m}->'execution'->'dispatch'->>'version' = '1'
      AND ${m}->'execution'->'dispatch'->>'state' IN ('pending', 'leased', 'acknowledged', 'uncertain')
      THEN (${m}->'execution'->>'deadlineAt')::timestamptz > clock_timestamp()
        AND (${m}->'execution'->'dispatch'->>'sendCount')::int < ${MAX_DISSECTION_DISPATCH_SENDS}
        AND (${m}->'execution'->'dispatch'->>'nextAttemptAt')::timestamptz <= clock_timestamp()
        AND COALESCE((${m}->'execution'->'dispatch'->>'leaseUntil')::timestamptz <= clock_timestamp(), TRUE)
      ELSE FALSE END`
}

function dispatchLease(prefix = '') {
  const d = `${prefix}manifest->'execution'->'dispatch'`
  return `jsonb_set(${prefix}manifest, '{execution,dispatch}', ${d} || jsonb_build_object(
    'state', 'leased', 'sendCount', (${d}->>'sendCount')::int + 1,
    'leaseToken', gen_random_uuid()::text,
    'leaseUntil', clock_timestamp() + interval '${DISSECTION_DISPATCH_LEASE_SECONDS} seconds',
    'lastSentAt', clock_timestamp(), 'acknowledgedAt', NULL,
    'nextAttemptAt', clock_timestamp() + (${DISSECTION_DISPATCH_LEASE_SECONDS}
      + LEAST(${DISSECTION_DISPATCH_MAX_BACKOFF_SECONDS}, ${DISSECTION_DISPATCH_BACKOFF_SECONDS} * power(2, (${d}->>'sendCount')::int))) * interval '1 second'))`
}

/** Initial dispatch and recovery acquire the same lease; neither creates a generation. */
export async function reserveDissectionDispatch(jobId: string, attemptId: string) {
  return await queryOneFresh<DissectionRecord>(
    `UPDATE banner_dissections SET manifest = ${dispatchLease()}, updated_at = NOW()
     WHERE job_id = $1 AND manifest->'execution'->>'attemptId' = $2 AND ${dispatchEligible()}
     RETURNING *`,
    [jobId, attemptId]
  )
}

export function dissectionRecoveryLimit(limit = DISSECTION_RECOVERY_BATCH_SIZE) {
  return Number.isFinite(limit) ? Math.max(1, Math.min(DISSECTION_RECOVERY_BATCH_SIZE, Math.floor(limit))) : DISSECTION_RECOVERY_BATCH_SIZE
}

/** Row locks partition concurrent scheduler passes; UPDATE rechecks the authoritative state. */
export async function claimDissectionDispatchBatch(limit = DISSECTION_RECOVERY_BATCH_SIZE) {
  return await queryRowsFresh<DissectionRecord>(
    `WITH candidates AS (
       SELECT job_id FROM banner_dissections WHERE ${dispatchEligible()}
       ORDER BY updated_at, job_id LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     UPDATE banner_dissections d SET manifest = ${dispatchLease('d.')}, updated_at = NOW()
     FROM candidates c WHERE d.job_id = c.job_id AND ${dispatchEligible('d.')}
     RETURNING d.*`,
    [dissectionRecoveryLimit(limit)]
  )
}

/** A late acknowledgement cannot clear a newer lease or overwrite claimed/terminal work. */
export async function acknowledgeDissectionDispatch(jobId: string, attemptId: string, leaseToken: string, accepted: boolean) {
  return await queryOneFresh<DissectionRecord>(
    `UPDATE banner_dissections SET manifest = jsonb_set(manifest, '{execution,dispatch}',
       manifest->'execution'->'dispatch' || jsonb_build_object(
         'state', $4::text, 'leaseUntil', NULL,
         'acknowledgedAt', CASE WHEN $4 = 'acknowledged' THEN clock_timestamp() ELSE NULL END,
         'nextAttemptAt', clock_timestamp() + LEAST(${DISSECTION_DISPATCH_MAX_BACKOFF_SECONDS},
           ${DISSECTION_DISPATCH_BACKOFF_SECONDS} * power(2, (manifest->'execution'->'dispatch'->>'sendCount')::int - 1)) * interval '1 second')), updated_at = NOW()
     WHERE job_id = $1 AND status = 'queued' AND manifest->'execution'->>'attemptId' = $2
       AND manifest->'execution'->'dispatch'->>'version' = '1'
       AND manifest->'execution'->'dispatch'->>'state' = 'leased'
       AND manifest->'execution'->'dispatch'->>'leaseToken' = $3
       AND (manifest->'execution'->'dispatch'->>'leaseUntil')::timestamptz > clock_timestamp()
       AND (manifest->'execution'->>'deadlineAt')::timestamptz > clock_timestamp()
     RETURNING *`,
    [jobId, attemptId, leaseToken, accepted ? 'acknowledged' : 'uncertain']
  )
}

/** Only known v1 attempts are swept; expiry fences state but never retries remote work. */
export async function expireDissectionRecoveryBatch(limit = DISSECTION_RECOVERY_BATCH_SIZE) {
  return await queryRowsFresh<{ job_id: string }>(
    `WITH candidates AS (
       SELECT job_id FROM banner_dissections
       WHERE status IN ('queued', 'analyzing', 'segmenting')
         AND CASE WHEN manifest->'execution'->'dispatch'->>'version' = '1'
           THEN (manifest->'execution'->>'deadlineAt')::timestamptz <= clock_timestamp() ELSE FALSE END
       ORDER BY updated_at, job_id LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     UPDATE banner_dissections d SET status = 'failed',
       error = 'Dissection attempt timed out. Retry explicitly after reviewing provider availability.',
       manifest = jsonb_set(d.manifest, '{execution}', d.manifest->'execution' ||
         jsonb_build_object('stage', 'failed', 'updatedAt', clock_timestamp(), 'finishedAt', clock_timestamp())), updated_at = NOW()
     FROM candidates c WHERE d.job_id = c.job_id AND d.status IN ('queued', 'analyzing', 'segmenting')
       AND d.manifest->'execution'->'dispatch'->>'version' = '1'
       AND (d.manifest->'execution'->>'deadlineAt')::timestamptz <= clock_timestamp()
     RETURNING d.job_id`,
    [dissectionRecoveryLimit(limit)]
  )
}

/** A send may have been accepted: never overwrite a claimed/cancelled/newer attempt. */
export async function failDissectionDispatch(jobId: string, attemptId: string, error: string, leaseToken?: string) {
  return await queryOneFresh<DissectionRecord>(
    `UPDATE banner_dissections SET status = 'failed', error = $3,
       manifest = jsonb_set(manifest, '{execution}', manifest->'execution' ||
         jsonb_build_object('stage', 'failed', 'updatedAt', $4::text, 'finishedAt', $4::text)), updated_at = NOW()
     WHERE job_id = $1 AND status = 'queued' AND manifest->'execution'->>'attemptId' = $2
       AND ($5::text IS NULL OR manifest->'execution'->'dispatch'->>'leaseToken' = $5)
     RETURNING *`,
    [jobId, attemptId, error, new Date().toISOString(), leaseToken || null]
  )
}

/** Execution can only claim its exact queued generation; retry admission is separate. */
export async function claimDissectionAttempt(jobId: string, options: DissectionAttemptOptions = {}) {
  if (!options.attemptId) return null
  await expireDissectionAttempt(jobId, options.userId)
  return await queryOneFresh<DissectionRecord>(
    `UPDATE banner_dissections SET status = 'analyzing', error = NULL,
       manifest = jsonb_set(manifest, '{execution}', manifest->'execution' || jsonb_build_object(
         'stage', 'analyzing', 'startedAt', $3::text, 'updatedAt', $3::text)), updated_at = NOW()
     WHERE job_id = $1 AND ($4::uuid IS NULL OR user_id = $4::uuid)
       AND status = 'queued' AND manifest->'execution'->>'attemptId' = $2
       AND (manifest->'execution'->>'deadlineAt')::timestamptz > clock_timestamp()
     RETURNING *`,
    [jobId, options.attemptId, new Date().toISOString(), options.userId || null]
  )
}

/** Authoritative metadata never comes from a model-generated manifest. */
export function dissectionArtwork(manifest: Partial<DissectorManifest>): Partial<DissectorManifest> {
  return {
    version: manifest.version, brand: manifest.brand, campaign_type: manifest.campaign_type,
    banner_size: manifest.banner_size, processed_at: manifest.processed_at,
    tokens: manifest.tokens, layers: manifest.layers, warnings: manifest.warnings
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
  return value
}

export function dissectionResultId(manifest: Partial<DissectorManifest>, attemptId?: string): string {
  return createHash('sha256').update(JSON.stringify(canonical({ artwork: dissectionArtwork(manifest), attemptId: attemptId || null }))).digest('hex')
}

export async function writeDissectionAttempt(
  jobId: string, execution: DissectionExecution, status: string,
  artwork: Partial<DissectorManifest> = {}, error: string | null = null
): Promise<DissectionRecord | null> {
  const now = new Date().toISOString()
  const terminal = ['complete', 'review_ready', 'failed'].includes(status)
  const next = {
    ...dissectionArtwork(artwork), jobId, status,
    execution: { ...execution, stage: status, updatedAt: now, ...(terminal ? { finishedAt: now } : {}),
      ...(['complete', 'review_ready'].includes(status) ? { resultId: dissectionResultId(artwork, execution.attemptId) } : {}) }
  }
  return await queryOneFresh<DissectionRecord>(
    `UPDATE banner_dissections SET status = $1, manifest = $2::jsonb, error = $3, updated_at = NOW()
     WHERE job_id = $4 AND manifest->'execution'->>'attemptId' = $5
       AND status IN ('analyzing', 'segmenting')
       AND COALESCE((manifest->'execution'->>'deadlineAt')::timestamptz, updated_at + interval '10 minutes') > clock_timestamp() RETURNING *`,
    [status, JSON.stringify(next), error, jobId, execution.attemptId]
  )
}

export async function isDissectionAttemptActive(jobId: string, attemptId: string): Promise<boolean> {
  return !!await queryOneFresh(
    `SELECT job_id FROM banner_dissections WHERE job_id = $1
     AND manifest->'execution'->>'attemptId' = $2 AND status IN ('analyzing', 'segmenting')
     AND COALESCE((manifest->'execution'->>'deadlineAt')::timestamptz, updated_at + interval '10 minutes') > clock_timestamp()`,
    [jobId, attemptId]
  )
}

export function dissectionSnapshot(row: DissectionRecord) {
  const persistedExecution = row.manifest?.execution
  const execution: DissectionExecution = persistedExecution?.attemptId
    ? persistedExecution
    : {
        attemptId: `legacy:${row.job_id}`, attempt: 1, maxAttempts: MAX_DISSECTION_ATTEMPTS,
        stage: row.status, startedAt: null, updatedAt: row.updated_at || row.created_at || ''
      }
  const reviewable = ['complete', 'review_ready', 'imported'].includes(row.status)
  return {
    ...(reviewable && row.manifest ? dissectionArtwork(row.manifest) : {}),
    jobId: row.job_id, status: row.status, execution,
    ...(reviewable && row.manifest ? { resultId: dissectionResultId(row.manifest, persistedExecution?.attemptId) } : {}),
    progress: { stage: row.status, completed: execution?.completed || 0, total: execution?.total || 0 },
    error: row.error || undefined, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export async function cancelDissection(jobId: string, userId: string) {
  await queryOneFresh(
    `UPDATE banner_dissections SET status = 'cancelled', error = NULL,
       manifest = jsonb_set(COALESCE(manifest, '{}'::jsonb), '{execution}',
         COALESCE(manifest->'execution', '{}'::jsonb) || jsonb_build_object('stage', 'cancelled', 'updatedAt', $3::text, 'finishedAt', $3::text)), updated_at = NOW()
     WHERE job_id = $1 AND user_id = $2 AND status NOT IN ('cancelled', 'imported') RETURNING job_id`,
    [jobId, userId, new Date().toISOString()]
  )
  const row = await loadDissection(jobId, userId)
  if (row.status === 'imported') throw createError({ statusCode: 409, statusMessage: 'Imported artwork cannot be cancelled' })
  return dissectionSnapshot(row)
}
