import { transaction as defaultTransaction } from '~~/server/utils/db'
import { canSpendVideoGenerationCents } from '~~/server/utils/video-generation/costs'
import { mapVideoGenerationJobRow } from '~~/server/utils/video-generation/jobs'
import { summarizeVideoGenerationBudget } from '~~/server/utils/video-generation/budgetStatus'
import type { VideoGenerationBudgetStatus } from '~~/server/utils/video-generation/budgetStatus'
import type { CreateVideoGenerationJobInput } from '~~/server/utils/video-generation/jobs'
import type { VideoGenerationJob, VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'
import {
  PROJECT_VIDEO_GENERATION_LIABILITY_SUM_SQL,
  TENANT_VIDEO_GENERATION_LIABILITY_BREAKDOWN_SQL,
  TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL,
  VIDEO_GENERATION_JOB_INSERT_SQL,
  VIDEO_GENERATION_TENANT_LOCK_SQL,
  comparableVideoGenerationFingerprint,
  fingerprintSourceFromJobInput,
  initialDispatchEligible,
  initialVideoGenerationLiability,
  videoGenerationJobInsertParams,
  videoGenerationRequestFingerprint,
} from '~~/shared/video/generationLiability'

export interface ReserveVideoGenerationJobInput extends CreateVideoGenerationJobInput {
  /** Optional project ceiling checked under the same tenant lock. Omit to skip. */
  projectAllowanceCents?: number | null
}

export interface ReserveVideoGenerationResult {
  ok: boolean
  job?: VideoGenerationJob
  reused?: boolean
  reason?: 'allowed' | 'tenant_generation_disabled' | 'tenant_cap_exceeded' | 'project_allowance_exceeded' | 'idempotency_key_conflict'
  remainingCents?: number
  /** Content-free explanation read in the same transaction (same now()) as the refusal. */
  budget?: VideoGenerationBudgetStatus
}

export interface VideoGenerationBudgetDb {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows?: Record<string, unknown>[] }>
}

export interface ReserveVideoGenerationDeps {
  transaction: <T>(callback: (db: VideoGenerationBudgetDb) => Promise<T>) => Promise<T>
}

const defaultDeps: ReserveVideoGenerationDeps = {
  transaction: defaultTransaction as ReserveVideoGenerationDeps['transaction'],
}

async function existingJobConflict(
  row: Record<string, unknown>,
  input: ReserveVideoGenerationJobInput,
  fingerprint: string,
): Promise<ReserveVideoGenerationResult | null> {
  const comparable = await comparableVideoGenerationFingerprint(row)
  if (comparable !== fingerprint || String(row.project_id) !== input.projectId || String(row.tenant_id) !== input.tenantId) {
    return { ok: false, reason: 'idempotency_key_conflict' }
  }
  return null
}

/**
 * Reserve inside a transaction the caller already opened. Takes the tenant budget lock
 * again; PostgreSQL advisory locks are reentrant on the same transaction, so a wrapper
 * that already holds `videogen:budget:<tenant>` does not deadlock.
 *
 * The request fingerprint is compared before any spend read or reprice. A matching key
 * returns the original row and its original liability. A different body is a conflict.
 */
export async function reserveAndCreateVideoGenerationJobIn(
  db: VideoGenerationBudgetDb,
  input: ReserveVideoGenerationJobInput,
  policy: VideoGenerationTenantPolicy | null | undefined,
): Promise<ReserveVideoGenerationResult> {
  await db.query(VIDEO_GENERATION_TENANT_LOCK_SQL, [input.tenantId])
  // An operation cannot become a new charge just because the project changes client.
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('videogen:project-operation:' || $1::text || ':' || $2::text, 0))", [input.projectId, input.idempotencyKey])

  const status = input.status ?? 'queued'
  const dispatchEligible = initialDispatchEligible(status, input.dispatchEligible)
  const fingerprint = await videoGenerationRequestFingerprint(fingerprintSourceFromJobInput({ ...input, dispatchEligible }))
  const existing = await db.query(
    `SELECT * FROM video_generation_jobs WHERE idempotency_key = $2 AND (tenant_id = $1 OR project_id = $3)`,
    [input.tenantId, input.idempotencyKey, input.projectId],
  )
  const existingRow = existing.rows?.[0]
  if (existingRow) {
    const conflict = await existingJobConflict(existingRow, input, fingerprint)
    if (conflict) return conflict
    return { ok: true, reused: true, job: mapVideoGenerationJobRow(existingRow) }
  }

  const spendRow = await db.query(TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL, [input.tenantId])
  const currentSpendCents = Number(spendRow.rows?.[0]?.total ?? 0)
  const decision = canSpendVideoGenerationCents(policy, currentSpendCents, input.estimatedCostCents)
  if (!decision.allowed) {
    if (decision.reason !== 'tenant_cap_exceeded' || !policy?.enabled) {
      return { ok: false, reason: decision.reason, remainingCents: decision.remainingCents }
    }
    const breakdown = await db.query(TENANT_VIDEO_GENERATION_LIABILITY_BREAKDOWN_SQL, [input.tenantId])
    const budget = summarizeVideoGenerationBudget(policy, (breakdown.rows ?? []) as unknown as Parameters<typeof summarizeVideoGenerationBudget>[1])
    return { ok: false, reason: decision.reason, remainingCents: decision.remainingCents, budget }
  }

  if (typeof input.projectAllowanceCents === 'number') {
    if ((!Number.isSafeInteger(input.projectAllowanceCents) || input.projectAllowanceCents < 0)) {
      return { ok: false, reason: 'project_allowance_exceeded', remainingCents: 0 }
    }
    const projectRow = await db.query(PROJECT_VIDEO_GENERATION_LIABILITY_SUM_SQL, [input.projectId])
    const projectSpendCents = Number(projectRow.rows?.[0]?.total ?? 0)
    if (!Number.isSafeInteger(projectSpendCents) || projectSpendCents < 0) {
      return { ok: false, reason: 'project_allowance_exceeded', remainingCents: 0 }
    }
    const projectRemaining = Math.max(0, input.projectAllowanceCents - projectSpendCents)
    if (input.estimatedCostCents > projectRemaining) {
      return { ok: false, reason: 'project_allowance_exceeded', remainingCents: projectRemaining }
    }
  }

  const liability = initialVideoGenerationLiability({
    status,
    estimatedCostCents: input.estimatedCostCents,
    actualCostCents: null,
  })
  const inserted = await db.query(
    VIDEO_GENERATION_JOB_INSERT_SQL,
    videoGenerationJobInsertParams({
      ...input,
      id: input.id ?? null,
      status,
      requestFingerprint: fingerprint,
      liabilityState: liability.liabilityState,
      liabilityCents: liability.liabilityCents,
      dispatchEligible,
    }),
  )
  const insertedRow = inserted.rows?.[0]
  if (!insertedRow) {
    const raced = await db.query(
      `SELECT * FROM video_generation_jobs WHERE idempotency_key = $2 AND (tenant_id = $1 OR project_id = $3)`,
      [input.tenantId, input.idempotencyKey, input.projectId],
    )
    const racedRow = raced.rows?.[0]
    if (!racedRow) throw new Error('video generation job insert failed')
    const conflict = await existingJobConflict(racedRow, input, fingerprint)
    if (conflict) return conflict
    return { ok: true, reused: true, job: mapVideoGenerationJobRow(racedRow) }
  }
  return { ok: true, reused: false, job: mapVideoGenerationJobRow(insertedRow) }
}

/**
 * Atomically reserve canonical job liability and create the queued job.
 * The wrapper takes the tenant lock; the shared implementation reuses it
 * and takes the project-operation lock within the same transaction.
 */
export async function reserveAndCreateVideoGenerationJob(
  input: ReserveVideoGenerationJobInput,
  policy: VideoGenerationTenantPolicy | null | undefined,
  deps: ReserveVideoGenerationDeps = defaultDeps,
): Promise<ReserveVideoGenerationResult> {
  return deps.transaction(async (db) => {
    await db.query(VIDEO_GENERATION_TENANT_LOCK_SQL, [input.tenantId])
    return reserveAndCreateVideoGenerationJobIn(db, input, policy)
  })
}
