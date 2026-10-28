import { queryOne, queryOneFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import {
  ACTIVE_PROJECT_CLIENT_SQL, checkMarketingBannerProjectPatch, isMarketingPortfolioUser, type MarketingBannerProject
} from '~~/server/utils/banner/marketingProjectAccess'

const MAX_VERSIONS_PER_PROJECT = 50

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody(event)
  const { name, canvasData, status, thumbnailUrl, tags, clientId } = body

  // Marketing-management portfolio: active clients and protected artwork are checked before any
  // snapshot, and the UPDATE below is bound to the checked client/review state.
  let checked: MarketingBannerProject | null = null
  let marketingTags: string[] | undefined
  if (isMarketingPortfolioUser(user)) {
    checked = await queryOneFresh<MarketingBannerProject>(
      'SELECT client_id, created_by, tags, review_status FROM banner_projects WHERE id = $1',
      [id]
    )
    if (!checked) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    marketingTags = (await checkMarketingBannerProjectPatch(event, user, checked, body)).tags
  }

  try {
    // Auto-snapshot: save current canvas_data as a version before overwriting
    if (canvasData !== undefined) {
      try {
        const current = await queryOne(
          'SELECT canvas_data FROM banner_projects WHERE id = $1',
          [id],
        ) as any

        if (current?.canvas_data) {
          const maxRow = await queryOne(
            'SELECT COALESCE(MAX(version_number), 0) AS "maxVersion" FROM banner_versions WHERE project_id = $1',
            [id],
          ) as any

          const nextVersion = (maxRow?.maxVersion || 0) + 1

          await queryOne(`
            INSERT INTO banner_versions (project_id, version_number, canvas_data, created_by)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `, [id, nextVersion, JSON.stringify(current.canvas_data), user.id])

          // Prune oldest versions if over limit
          await queryOne(`
            DELETE FROM banner_versions
            WHERE id IN (
              SELECT id FROM banner_versions
              WHERE project_id = $1
              ORDER BY version_number DESC
              OFFSET $2
            )
          `, [id, MAX_VERSIONS_PER_PROJECT])
        }
      } catch (vErr) {
        // Version snapshot is non-critical — log and continue
        console.warn('Failed to create version snapshot:', vErr)
      }
    }

    const sets: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      sets.push(`name = $${paramIndex}`)
      params.push(name.trim())
      paramIndex++
    }

    let clientIndex: number | null = null
    if (clientId !== undefined) {
      if (clientId !== null && !/^[0-9a-f-]{36}$/i.test(String(clientId))) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
      }
      clientIndex = paramIndex
      sets.push(`client_id = $${paramIndex}`)
      params.push(clientId)
      paramIndex++
    }

    if (canvasData !== undefined) {
      sets.push(`canvas_data = $${paramIndex}`)
      params.push(JSON.stringify(canvasData))
      paramIndex++
    }

    if (status !== undefined) {
      sets.push(`status = $${paramIndex}`)
      params.push(status)
      paramIndex++
    }

    if (thumbnailUrl !== undefined) {
      sets.push(`thumbnail_url = $${paramIndex}`)
      params.push(thumbnailUrl)
      paramIndex++
    }

    if (tags !== undefined) {
      sets.push(`tags = $${paramIndex}`)
      params.push(marketingTags ?? tags)
      paramIndex++
    }

    if (sets.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    sets.push('updated_at = NOW()')

    const guard = checked
      ? ` AND client_id IS NOT DISTINCT FROM $${paramIndex}::uuid AND review_status::text IS NOT DISTINCT FROM $${paramIndex + 1}::text
        AND ${ACTIVE_PROJECT_CLIENT_SQL}${clientIndex === null
          ? ''
          : ` AND ($${clientIndex}::uuid IS NULL OR EXISTS (SELECT 1 FROM agency_clients target_client
            WHERE target_client.id = $${clientIndex}::uuid AND target_client.is_active = TRUE))`}`
      : ''
    const idIndex = checked ? paramIndex + 2 : paramIndex
    const row = await queryOne(`
      UPDATE banner_projects
      SET ${sets.join(', ')}
      WHERE id = $${idIndex}${guard}
      RETURNING
        id, name,
        client_id AS "clientId",
        canvas_data AS "canvasData",
        thumbnail_url AS "thumbnailUrl",
        status, tags,
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, checked ? [...params, checked.client_id, checked.review_status ?? null, id] : [...params, id])

    if (!row && checked) {
      throw createError({ statusCode: 409, statusMessage: 'Project or client access changed; reload before saving' })
    }
    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

    return row
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update banner project' })
  }
})
