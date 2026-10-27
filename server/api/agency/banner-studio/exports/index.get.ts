import { setResponseHeader } from 'h3'
import { queryOneFresh, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { bannerRenderDownloadUrl } from '~~/server/utils/banner/renderJob'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { resolveDissectionContext } from '~~/server/utils/banner/dissectionAccess'
import { parseScopedExportProvenance, recheckScopedExport } from '~~/server/utils/banner/scopedExport'

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
  if (event.node?.res) setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)

  const query = getQuery(event)
  const { projectId } = query

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }
  const project = await queryOneFresh<{ client_id: string | null, created_by: string | null }>(
    'SELECT client_id, created_by FROM banner_projects WHERE id = $1', [projectId])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (project.client_id) await requireSocialClientAccess(event, project.client_id)
  else if (project.created_by !== user.id && !hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  }

  try {
    const rows = await queryRowsFresh<BannerExportRow>(`
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
        AND (e.r2_key NOT LIKE 'scoped-banner-exports/%' OR e.exported_by = $2)
      ORDER BY e.exported_at DESC
    `, [projectId, user.id])

    const restricted = new Set<string>()
    for (const row of rows) {
      if (!row.r2Key.startsWith('scoped-banner-exports/')) continue
      try {
        if (row.exportedBy !== user.id) throw createError({ statusCode: 403, statusMessage: 'No access to this export' })
        await transactionWithoutRetry(db => resolveDissectionContext(db, user.id, { projectId: row.projectId }, 'read'))
        const bucket = event.context.cloudflare?.env?.MEDIA_BUCKET
        if (!bucket || typeof bucket.head !== 'function') throw createError({ statusCode: 503, statusMessage: 'Protected export history is unavailable' })
        const object = await bucket.head(row.r2Key)
        const provenance = parseScopedExportProvenance(object?.customMetadata, row.id, row.projectId)
        await recheckScopedExport(user.id, provenance, false)
      } catch (error: unknown) {
        if (!error || typeof error !== 'object' || !('statusCode' in error) || error.statusCode !== 403) throw error
        // Retain the history slot without exposing protected metadata or hiding service failures.
        restricted.add(row.id)
      }
    }

    return rows.map(({ exportType, renderJobId, r2Key, ...row }) => restricted.has(row.id)
      ? { id: row.id, restricted: true, url: null }
      : ({
          ...row,
          ...(r2Key.startsWith('scoped-banner-exports/') ? {} : { r2Key }),
          exportType,
          renderJobId,
          url: r2Key.startsWith('scoped-banner-exports/')
            ? `/api/agency/banner-studio/exports/${row.id}/download`
            : exportType === 'mp4'
              ? (renderJobId ? bannerRenderDownloadUrl(renderJobId) : null)
              : row.url
        }))
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to fetch banner exports:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner exports' })
  }
})
