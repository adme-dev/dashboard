import { queryOne, queryOneFresh } from '~~/server/utils/db'
import type { VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'

export async function loadTenantVideoGenerationPolicy(tenantId: string): Promise<VideoGenerationTenantPolicy> {
  const profile = await queryOneFresh<{ enabled: boolean; monthly_cap_cents: number | string; allowed_model_ids: string[] }>(
    'SELECT enabled, monthly_cap_cents, allowed_model_ids FROM client_video_generation_profiles WHERE client_id::text = $1', [tenantId]
  )
  if (profile) return profile.enabled
    ? { enabled: true, monthlyCapCents: Number(profile.monthly_cap_cents), allowedModelIds: profile.allowed_model_ids }
    : { enabled: false, monthlyCapCents: 0, allowedModelIds: [] }
  if (process.env.VIDEO_GENERATION_TEST_TENANT_ENABLED === 'true') {
    const testTenantIds = (process.env.VIDEO_GENERATION_TEST_TENANT_ID ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
    if (!testTenantIds.includes(tenantId)) {
      return { enabled: false, monthlyCapCents: 0, allowedModelIds: [] }
    }
    return {
      enabled: true,
      monthlyCapCents: Number(process.env.VIDEO_GENERATION_TEST_TENANT_CAP_CENTS ?? 1000),
      // Explicit legacy test tenant fallback; saved production settings take precedence.
    }
  }
  return { enabled: false, monthlyCapCents: 0, allowedModelIds: [] }
}

export async function getTenantVideoGenerationSpendCents(tenantId: string): Promise<number> {
  const row = await queryOne<{ total: string | number | null }>(
    `SELECT COALESCE(SUM(COALESCE(actual_cost_cents, estimated_cost_cents)), 0) AS total
     FROM video_generation_jobs
     WHERE tenant_id = $1
       AND status IN ('queued','running','succeeded')
       AND created_at >= date_trunc('month', now())`,
    [tenantId]
  )
  return Number(row?.total ?? 0)
}
