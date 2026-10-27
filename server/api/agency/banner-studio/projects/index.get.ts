import { assertScopedCanvasAccess } from '~~/server/utils/banner/scopedCanvasAccess'
import { hasScopedCanvas } from '#shared/bannerScopedCanvas'
import { queryRowsFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, hasSocialClientPermission, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const RESTRICTED_NAME = 'Restricted artwork'
function pageNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const text = String(value)
  if (!/^\d{1,9}$/.test(text)) throw createError({ statusCode: 400, statusMessage: 'Invalid pagination' })
  return Number(text)
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')

  const query = getQuery(event)
  const { clientId, status, search } = query
  const limit = pageNumber(query.limit)
  const offset = pageNumber(query.offset)
  // Search matches only the projection the caller may see, so it runs after
  // redaction as a literal case-insensitive substring (no LIKE wildcards).
  const term = search ? String(search).toLowerCase() : ''
  if (clientId) await requireSocialClientAccess(event, String(clientId))

  try {
    let sql = `
      SELECT
        p.id, p.name,
        p.client_id AS "clientId",
        c.name AS "clientName",
        p.canvas_data AS "canvasData",
        p.thumbnail_url AS "thumbnailUrl",
        p.status,
        p.tags,
        p.created_by AS "createdBy",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM banner_projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      WHERE 1=1
    `

    const params: unknown[] = []
    let paramIndex = 1
    if (!hasAllSocialClientAccess(user)) {
      sql += ` AND ((p.client_id IS NULL AND p.created_by = $${paramIndex})`
      params.push(user.id)
      if (hasSocialClientPermission(user)) {
        sql += ` OR EXISTS (SELECT 1 FROM client_team_assignments a WHERE a.client_id = p.client_id AND a.team_member_id = $${paramIndex})`
      }
      sql += ')'
      paramIndex++
    } else if (!hasSocialClientPermission(user)) {
      sql += ' AND p.client_id IS NULL'
    }

    if (clientId) {
      sql += ` AND p.client_id = $${paramIndex}`
      params.push(clientId)
      paramIndex++
    }

    if (status && status !== 'all') {
      sql += ` AND p.status = $${paramIndex}`
      params.push(status)
      paramIndex++
    }

    sql += ' ORDER BY p.updated_at DESC'

    // Without a search every SQL slot is returned (restricted rows keep their
    // position), so SQL pagination is exact. With a search, a stored name must
    // never decide SQL membership or page boundaries: page over visible matches.
    if (!term && limit !== undefined) {
      sql += ` LIMIT $${paramIndex}`
      params.push(limit)
      paramIndex++
    }

    if (!term && offset !== undefined) {
      sql += ` OFFSET $${paramIndex}`
      params.push(offset)
      paramIndex++
    }

    const rows = await queryRowsFresh(sql, params)
    // Keep every pagination slot, but never project private fields on source
    // denial. Only explicit access denials are redacted; outages still surface.
    // Every row up to the page end is authorized in order, whatever the search,
    // so neither results nor authority work depend on a hidden name.
    const projects = []
    let skipped = 0
    for (const row of rows) {
      if (term && limit !== undefined && projects.length >= limit) break
      let visible
      try {
        await assertScopedCanvasAccess(user.id, row.canvasData, row.id)
        visible = hasScopedCanvas(row.canvasData) ? { ...row, thumbnailUrl: null } : row
      } catch (error) {
        if ((error as { statusCode?: number } | null)?.statusCode !== 403 || !hasScopedCanvas(row.canvasData)) throw error
        visible = { id: row.id, name: RESTRICTED_NAME, status: 'restricted', restricted: true }
      }
      if (term && !String(visible.name ?? '').toLowerCase().includes(term)) continue
      if (term && skipped < (offset ?? 0)) {
        skipped++
        continue
      }
      projects.push(visible)
    }
    return projects
  } catch (error) {
    if ((error as { statusCode?: number } | null)?.statusCode) throw error
    console.error('Failed to fetch banner projects:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner projects' })
  }
})
