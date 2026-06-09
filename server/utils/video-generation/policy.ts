import { queryOne } from '~~/server/utils/db'
import type { VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'

export async function loadTenantVideoGenerationPolicy(tenantId: string): Promise<VideoGenerationTenantPolicy> {
  if (process.env.VIDEO_GENERATION_TEST_TENANT_ENABLED === 'true') {
    return {
      enabled: true,
      monthlyCapCents: Number(process.env.VIDEO_GENERATION_TEST_TENANT_CAP_CENTS ?? 1000),
      allowedModelIds: ['mock/i2v-safe', 'mock/t2v-broll'],
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
