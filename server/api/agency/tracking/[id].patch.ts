/** Update tracking site config. PATCH /api/agency/tracking/:id */
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { invalidateSiteCache } from '~~/server/utils/tracking/site-config'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'])
  const id = getRouterParam(event, 'id')
  const body = await readBody<Record<string, unknown>>(event)
  const allowed = ['name', 'allowed_origins', 'spa', 'consent_mode', 'lead_selectors', 'retention_days', 'is_active']
  const sets: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(body || {})) {
    const col = k.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (allowed.includes(col)) { params.push(v); sets.push(`${col} = $${params.length}`) }
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No updatable fields' })
  params.push(id)
  const row = await queryOne(
    `UPDATE tracking_sites SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  ) as any
  if (row?.write_key) invalidateSiteCache(row.write_key)
  return { site: row }
})
