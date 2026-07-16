/** PATCH /api/agency/social/news/sources/:sourceKey — update a plug-in endpoint/settings. */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { isSafeNewsSourceUrl } from '~~/server/utils/socialNewsSources'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.ADMIN)
  const sourceKey = getRouterParam(event, 'sourceKey')
  if (!sourceKey) throw createError({ statusCode: 400, statusMessage: 'sourceKey required' })
  const body = await readBody<{ endpointUrl?: string; enabled?: boolean; settings?: Record<string, unknown> }>(event)
  if (body?.endpointUrl !== undefined && !isSafeNewsSourceUrl(body.endpointUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'endpointUrl must be an HTTPS URL' })
  }
  const fields: string[] = []; const params: unknown[] = []
  if (body?.endpointUrl !== undefined) { fields.push(`endpoint_url = $${params.push(body.endpointUrl)}`) }
  if (body?.enabled !== undefined) { fields.push(`enabled = $${params.push(Boolean(body.enabled))}`) }
  if (body?.settings !== undefined) { fields.push(`settings = $${params.push(JSON.stringify(body.settings))}::jsonb`) }
  if (!fields.length) throw createError({ statusCode: 400, statusMessage: 'No settings supplied' })
  params.push(sourceKey)
  await execute(`UPDATE social_news_sources SET ${fields.join(', ')}, updated_at = NOW() WHERE source_key = $${params.length}`, params)
  return { ok: true, sourceKey }
})
