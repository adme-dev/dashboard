import { queryOne, queryOneFresh } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { validateBannerPlatformQrCanvas } from '~~/server/utils/banner/platformQrCanvas'

const MAX_VERSIONS_PER_PROJECT = 50

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody(event)
  const { name, canvasData, status, thumbnailUrl, tags, clientId, expectedRevision } = body
  if (expectedRevision !== undefined && (typeof expectedRevision !== 'string' || !Number.isFinite(Date.parse(expectedRevision)))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid saved project revision' })
  }

  // Apply the same scope as reads before snapshots or any other mutation.
  const existing = await queryOneFresh<{ clientId: string | null, createdBy: string, updatedAt: string, canvasData: unknown }>(
    'SELECT client_id AS "clientId", created_by AS "createdBy", updated_at AS "updatedAt", canvas_data AS "canvasData" FROM banner_projects WHERE id = $1', [id]
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.clientId) await requireSocialClientAccess(event, existing.clientId)
  else if (existing.createdBy !== user.id && !hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  }
  if (clientId !== undefined && clientId !== null) {
    if (!/^[0-9a-f-]{36}$/i.test(String(clientId))) throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
    await requireSocialClientAccess(event, clientId)
  }
  if (expectedRevision && new Date(existing.updatedAt).getTime() !== Date.parse(expectedRevision)) {
    throw createError({ statusCode: 409, statusMessage: 'Artwork changed elsewhere. Reload before saving; your local edits have not been saved.' })
  }
  const writeRevision = expectedRevision || existing.updatedAt
  await validateBannerPlatformQrCanvas(
    event,
    existing.canvasData,
    canvasData === undefined ? existing.canvasData : canvasData,
    clientId === undefined ? existing.clientId : clientId
  )

  try {
    // Auto-snapshot: save current canvas_data as a version before overwriting
    if (canvasData !== undefined) {
      try {
        if (existing.canvasData) {
          const maxRow = await queryOne(
            'SELECT COALESCE(MAX(version_number), 0) AS "maxVersion" FROM banner_versions WHERE project_id = $1',
            [id],
          ) as any

          const nextVersion = (maxRow?.maxVersion || 0) + 1

          await queryOne(`
            INSERT INTO banner_versions (project_id, version_number, canvas_data, created_by)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `, [id, nextVersion, JSON.stringify(existing.canvasData), user.id])

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

    if (clientId !== undefined) {
      if (clientId !== null && !/^[0-9a-f-]{36}$/i.test(String(clientId))) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
      }
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
      params.push(tags)
      paramIndex++
    }

    if (sets.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    // JSON timestamps have millisecond precision. Advance at least one millisecond
    // so consecutive writes cannot share the same compare-and-swap revision.
    sets.push("updated_at = GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')")

    const row = await queryOne(`
      UPDATE banner_projects
      SET ${sets.join(', ')}
      WHERE id = $${paramIndex}${writeRevision ? ` AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $${paramIndex + 1}::timestamptz)` : ''}
      RETURNING
        id, name,
        client_id AS "clientId",
        canvas_data AS "canvasData",
        thumbnail_url AS "thumbnailUrl",
        status, tags,
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, [...params, id, ...(writeRevision ? [writeRevision] : [])])

    if (!row) {
      throw createError({ statusCode: writeRevision ? 409 : 404, statusMessage: writeRevision ? 'Artwork changed elsewhere. Reload before saving; your local edits have not been saved.' : 'Project not found' })
    }

    return row
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update banner project' })
  }
})
