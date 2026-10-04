import { canRetryBannerJob } from '~~/server/utils/banner/renderDispatch'
import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { projectJobStatus, type BannerJobRow } from '~~/server/utils/banner/renderJob'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const query = getQuery(event)
  const projectId = typeof query.projectId === 'string' ? query.projectId : ''
  type ProjectAccess = { client_id: string | null, created_by: string | null }
  async function requireProjectAccess(project: ProjectAccess) {
    if (project.client_id) await requireSocialClientAccess(event, project.client_id)
    else if (project.created_by !== user.id && !hasAllSocialClientAccess(user)) {
      throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
    }
  }
  if (projectId) {
    const project = await queryOneFresh<ProjectAccess>('SELECT client_id, created_by FROM banner_projects WHERE id = $1', [projectId])
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    await requireProjectAccess(project)
    // Keep every pending job visible, plus the latest twenty settled jobs.
    const rows = await queryRowsFresh<BannerJobRow & { updated_at: string }>(
      `SELECT * FROM banner_render_jobs WHERE project_id = $1 AND (
        status NOT IN ('done', 'failed') OR id IN (
          SELECT id FROM banner_render_jobs WHERE project_id = $1
          AND status IN ('done', 'failed') ORDER BY created_at DESC LIMIT 20
        )) ORDER BY created_at DESC`, [projectId])
    return { jobs: projectJobStatus(rows).map((job, index) => ({ ...job, canRetry: canRetryBannerJob(rows[index]) })) }
  }
  const ids = String(query.ids ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 20)
  if (!ids.length) return { jobs: [] }
  const rows = await queryRowsFresh<BannerJobRow & ProjectAccess & { updated_at: string }>(
    `SELECT j.*, p.client_id, p.created_by FROM banner_render_jobs j
       JOIN banner_projects p ON p.id = j.project_id WHERE j.id = ANY($1)`, [ids])
  const checked = new Set<string>()
  for (const row of rows) {
    if (checked.has(row.project_id)) continue
    await requireProjectAccess(row)
    checked.add(row.project_id)
  }
  return { jobs: projectJobStatus(rows).map((job, index) => ({ ...job, canRetry: canRetryBannerJob(rows[index]) })) }
})
