import { createError } from 'h3'
import { queryOne, queryOneFresh } from '~~/server/utils/db'
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

export function agencyVideoGenerationPolicy(): VideoGenerationTenantPolicy {
  return { enabled: true, payer: 'agency', monthlyCapCents: null }
}

// The system role can be edited to read-only too. A missing assigned custom role fails closed.
export const WRITABLE_VIDEO_STAFF_SQL = `
  SELECT tm.id, tm.user_role AS role FROM team_members tm
    LEFT JOIN custom_roles cr ON cr.id = tm.custom_role_id
      OR (tm.custom_role_id IS NULL AND cr.slug = tm.user_role::text AND cr.is_system = TRUE)
   WHERE tm.id = $1 AND tm.is_active = TRUE AND tm.user_role NOT IN ('viewer', 'guest')
     AND (cr.is_read_only = FALSE OR (cr.id IS NULL AND tm.custom_role_id IS NULL))`

/** Only authenticated team members can place a generation on the agency account. */
export async function loadStaffVideoGenerationPolicy(userId: string): Promise<VideoGenerationTenantPolicy> {
  const staff = await queryOneFresh<{ id: string }>(WRITABLE_VIDEO_STAFF_SQL, [userId])
  if (!staff) throw createError({ statusCode: 403, statusMessage: 'Active agency write access is required' })
  return agencyVideoGenerationPolicy()
}

export async function getTenantVideoGenerationSpendCents(tenantId: string): Promise<number> {
  const row = await queryOne<{ total: string | number | null }>(
    TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL,
    [tenantId],
  )
  return Number(row?.total ?? 0)
}
