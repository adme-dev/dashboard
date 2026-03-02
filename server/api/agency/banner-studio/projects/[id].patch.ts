import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const MAX_VERSIONS_PER_PROJECT = 50

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody(event)
  const { name, canvasData, status, thumbnailUrl, tags } = body

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

    sets.push('updated_at = NOW()')

    const row = await queryOne(`
      UPDATE banner_projects
      SET ${sets.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING
        id, name,
        client_id AS "clientId",
        canvas_data AS "canvasData",
        thumbnail_url AS "thumbnailUrl",
        status, tags,
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, [...params, id])

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
