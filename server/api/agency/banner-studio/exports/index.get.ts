import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { bannerRenderDownloadUrl } from '~~/server/utils/banner/renderJob'

interface BannerExportRow {
  id: string
  projectId: string
  formatKey: string
  r2Key: string
  url: string
  fileSize: number | null
  exportedBy: string
  exportedAt: string
  exportType: string | null
  renderJobId: string | null
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const { projectId } = query

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  try {
    const rows = await queryRows<BannerExportRow>(`
      SELECT
        e.id,
        e.project_id AS "projectId",
        e.format_key AS "formatKey",
        e.r2_key AS "r2Key",
        e.url,
        e.file_size AS "fileSize",
        e.exported_by AS "exportedBy",
        e.exported_at AS "exportedAt",
        e.export_type AS "exportType",
        j.id AS "renderJobId"
      FROM banner_exports e
      LEFT JOIN banner_render_jobs j ON j.export_id = e.id AND j.status = 'done'
      WHERE e.project_id = $1
      ORDER BY e.exported_at DESC
    `, [projectId])

    return rows.map(({ exportType, renderJobId, ...row }) => ({
      ...row,
      url: exportType === 'mp4'
        ? (renderJobId ? bannerRenderDownloadUrl(renderJobId) : null)
        : row.url
    }))
  } catch (error: unknown) {
    console.error('Failed to fetch banner exports:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner exports' })
  }
})
