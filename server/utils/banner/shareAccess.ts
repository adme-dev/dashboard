import type { H3Event } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { isMarketingPortfolioUser, requireMarketingBannerProjectAccess } from '~~/server/utils/banner/marketingProjectAccess'
import type { User } from '~~/server/utils/auth'

export async function requireBannerShareAccess(event: H3Event, user: User, projectId: string): Promise<{ client_id: string | null, created_by: string | null }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }
  const project = await queryOneFresh<{ client_id: string | null, created_by: string | null, tags: string[] | null }>(
    'SELECT client_id, created_by, tags FROM banner_projects WHERE id = $1', [projectId])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (isMarketingPortfolioUser(user)) await requireMarketingBannerProjectAccess(event, user, project)
  else if (project.client_id) await requireSocialClientAccess(event, project.client_id)
  else if (project.created_by !== user.id && !hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  }
  return project
}
