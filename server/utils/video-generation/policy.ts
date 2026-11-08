import { queryOne } from '~~/server/utils/db'
import { TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL } from '~~/shared/video/generationLiability'
import type { VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'

export async function loadTenantVideoGenerationPolicy(tenantId: string, env: Record<string, unknown> = process.env): Promise<VideoGenerationTenantPolicy> {
  if (env.VIDEO_GENERATION_TEST_TENANT_ENABLED === 'true') {
    const testTenantIds = String(env.VIDEO_GENERATION_TEST_TENANT_ID ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
    if (!testTenantIds.includes(tenantId)) {
      return { enabled: false, monthlyCapCents: 0, allowedModelIds: [] }
    }
    return {
      enabled: true,
      monthlyCapCents: Number(env.VIDEO_GENERATION_TEST_TENANT_CAP_CENTS ?? 1000),
      // No allow-list -> every registered, selectable model is permitted under the
      // configured test tenant (there is no DB-backed per-client policy yet).
    }
  }
  return { enabled: false, monthlyCapCents: 0, allowedModelIds: [] }
}

export async function getTenantVideoGenerationSpendCents(tenantId: string): Promise<number> {
  const row = await queryOne<{ total: string | number | null }>(
    TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL,
    [tenantId],
  )
  return Number(row?.total ?? 0)
}
