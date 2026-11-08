import { queryRows } from '~~/server/utils/db'
import { TENANT_VIDEO_GENERATION_LIABILITY_BREAKDOWN_SQL } from '~~/shared/video/generationLiability'
import type { VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'

export interface VideoGenerationBudgetBucket {
  jobs: number
  cents: number
}

/**
 * Content-free explanation of a tenant's generation budget. `uncertain` is liability
 * that has not been proven billed or unbilled (for example historical jobs from before
 * submission claims existed); it is not an actual charge, but it counts against the cap
 * until an administrator reconciles it.
 */
export interface VideoGenerationBudgetStatus {
  capCents: number
  committedCents: number
  availableCents: number
  reported: VideoGenerationBudgetBucket
  reserved: VideoGenerationBudgetBucket
  uncertain: VideoGenerationBudgetBucket
}

type BreakdownRow = { liability_state: string, jobs: number | string, cents: number | string }

export function summarizeVideoGenerationBudget(
  policy: Pick<VideoGenerationTenantPolicy, 'monthlyCapCents'>,
  rows: readonly BreakdownRow[]
): VideoGenerationBudgetStatus {
  const bucket = (state: string): VideoGenerationBudgetBucket => {
    const row = rows.find(r => r.liability_state === state)
    return { jobs: Number(row?.jobs ?? 0), cents: Number(row?.cents ?? 0) }
  }
  const reported = bucket('reported')
  const reserved = bucket('reserved')
  const uncertain = bucket('uncertain')
  const committedCents = reported.cents + reserved.cents + uncertain.cents
  const capCents = Number.isSafeInteger(policy.monthlyCapCents) && policy.monthlyCapCents > 0 ? policy.monthlyCapCents : 0
  return { capCents, committedCents, availableCents: Math.max(0, capCents - committedCents), reported, reserved, uncertain }
}

export async function loadVideoGenerationBudgetStatus(
  tenantId: string,
  policy: Pick<VideoGenerationTenantPolicy, 'monthlyCapCents'>,
  query: (sql: string, params: unknown[]) => Promise<BreakdownRow[]> = (sql, params) => queryRows<BreakdownRow>(sql, params)
): Promise<VideoGenerationBudgetStatus> {
  return summarizeVideoGenerationBudget(policy, await query(TENANT_VIDEO_GENERATION_LIABILITY_BREAKDOWN_SQL, [tenantId]))
}
