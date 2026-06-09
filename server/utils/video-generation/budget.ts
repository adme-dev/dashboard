import { transaction as defaultTransaction } from '~~/server/utils/db'
import { canSpendVideoGenerationCents } from '~~/server/utils/video-generation/costs'
import { mapVideoGenerationJobRow } from '~~/server/utils/video-generation/jobs'
import type { CreateVideoGenerationJobInput } from '~~/server/utils/video-generation/jobs'
import type { VideoGenerationJob, VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'

export interface ReserveVideoGenerationResult {
  ok: boolean
  job?: VideoGenerationJob
  reused?: boolean
  reason?: 'allowed' | 'tenant_generation_disabled' | 'tenant_cap_exceeded'
  remainingCents?: number
}

export interface ReserveVideoGenerationDeps {
  transaction: typeof defaultTransaction
}

const defaultDeps: ReserveVideoGenerationDeps = { transaction: defaultTransaction }

/**
 * Atomically reserve per-tenant monthly budget and create the queued job in ONE transaction.
 *
 * Why a transaction + advisory lock instead of the old check-then-insert: two concurrent
 * requests could each read the same spend, both pass the cap check, and both insert — busting
 * the cap. Holding `pg_advisory_xact_lock(tenant)` for the read+insert serializes reservations
 * per tenant, so the spend SUM a request sees already includes every committed reservation.
 *
 * There is no separate ledger: the queued/running job row IS the reservation. Release and
 * commit are emergent from job status — `getTenantVideoGenerationSpendCents` only counts
 * queued/running/succeeded, so a job moving to failed/blocked drops out of the SUM (release),
 * and actual_cost_cents replaces the estimate on success (commit-to-actual).
 */
export async function reserveAndCreateVideoGenerationJob(
  input: CreateVideoGenerationJobInput,
  policy: VideoGenerationTenantPolicy | null | undefined,
  deps: ReserveVideoGenerationDeps = defaultDeps
): Promise<ReserveVideoGenerationResult> {
  return deps.transaction(async (db) => {
    // Serialize all budget reservations for this tenant for the life of the transaction.
    // hashtextextended → bigint advisory key; scoped to the videogen budget domain.
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended('videogen:budget:' || $1::text, 0))`, [
      input.tenantId,
    ])

    // Idempotency re-check INSIDE the lock: a concurrent same-key request that already
    // reserved must be returned as reused, never re-rejected on cap.
    const existing = await db.query(
      `SELECT * FROM video_generation_jobs WHERE tenant_id = $1 AND idempotency_key = $2`,
      [input.tenantId, input.idempotencyKey]
    )
    if (existing.rows?.[0]) {
      return { ok: true, reused: true, job: mapVideoGenerationJobRow(existing.rows[0]) }
    }

    const spendRow = await db.query(
      `SELECT COALESCE(SUM(COALESCE(actual_cost_cents, estimated_cost_cents)), 0) AS total
         FROM video_generation_jobs
        WHERE tenant_id = $1
          AND status IN ('queued','running','succeeded')
          AND created_at >= date_trunc('month', now())`,
      [input.tenantId]
    )
    const currentSpendCents = Number(spendRow.rows?.[0]?.total ?? 0)

    const decision = canSpendVideoGenerationCents(policy, currentSpendCents, input.estimatedCostCents)
    if (!decision.allowed) {
      return { ok: false, reason: decision.reason, remainingCents: decision.remainingCents }
    }

    const inserted = await db.query(
      `INSERT INTO video_generation_jobs (
         id, tenant_id, project_id, timeline_id, created_by, status, mode, model_id, provider,
         prompt, source_asset_ids, duration_seconds, aspect_ratio, resolution, subject_type,
         compliance_status, compliance_reasons, estimated_cost_cents, idempotency_key
       )
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET updated_at = video_generation_jobs.updated_at
       RETURNING *`,
      [
        input.tenantId,
        input.projectId,
        input.timelineId,
        input.createdBy,
        input.status ?? 'queued',
        input.mode,
        input.modelId,
        input.provider,
        input.prompt,
        JSON.stringify(input.sourceAssetIds),
        input.durationSeconds,
        input.aspectRatio,
        input.resolution,
        input.subjectType,
        input.complianceStatus,
        JSON.stringify(input.complianceReasons),
        input.estimatedCostCents,
        input.idempotencyKey,
      ]
    )
    return { ok: true, reused: false, job: mapVideoGenerationJobRow(inserted.rows[0]) }
  })
}
