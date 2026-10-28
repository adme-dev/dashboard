import { queryOneFresh } from '~~/server/utils/db'
import { requireFreshSocialClientAccess } from '~~/server/utils/social/clientAccess'
/**
 * Refresh Meta ad statuses for a single project on demand (UI "Refresh" button).
 * POST /api/agency/banner-studio/ad-publish/meta/sync-status
 * Body: { projectId }
 *
 * Thin wrapper over the same runner the hourly cron uses, scoped to one project.
 */
import { requireAuth } from '~~/server/utils/auth'
import { syncMetaAdStatuses } from '~~/server/utils/metaAdStatusSync'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)
  const { projectId } = body as { projectId: string }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  const project = await queryOneFresh<{ client_id: string }>('SELECT client_id FROM banner_projects WHERE id=$1', [projectId])
  if (!project?.client_id) throw createError({ statusCode: 404, statusMessage: 'Client project unavailable' })
  const { context } = await requireFreshSocialClientAccess(event, project.client_id)
  if (context.assistantReadOnly) throw createError({ statusCode: 403, statusMessage: 'Writable marketing role required' })
  const result = await syncMetaAdStatuses({ projectId, limit: 50 })
  return { ok: true, ...result }
})
