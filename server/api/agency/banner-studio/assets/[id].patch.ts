import { queryOne, queryOneFresh } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { preservePlatformQrAssetAttestations } from '~~/server/utils/banner/platformQrCanvas'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Asset ID is required' })
  }

  const body = await readBody(event)
  const { name, tags } = body
  const existing = await queryOneFresh<{ client_id: string | null, uploaded_by: string, tags: unknown }>(
    'SELECT client_id, uploaded_by, tags FROM banner_assets WHERE id = $1', [id]
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  if (existing.client_id) await requireSocialClientAccess(event, existing.client_id)
  else if (existing.uploaded_by !== user.id && !hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this asset' })
  }
  const savedTags = tags === undefined ? undefined : preservePlatformQrAssetAttestations(existing.tags, tags)

  try {
    const sets: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (name !== undefined) {
      sets.push(`name = $${paramIndex}`)
      params.push(name.trim())
      paramIndex++
    }

    if (tags !== undefined) {
      sets.push(`tags = $${paramIndex}`)
      params.push(savedTags)
      paramIndex++
    }

    if (sets.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    const row = await queryOne(`
      UPDATE banner_assets
      SET ${sets.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING
        id, name,
        mime_type AS "mimeType",
        file_size AS "fileSize",
        r2_key AS "r2Key",
        url,
        thumbnail_url AS "thumbnailUrl",
        tags,
        uploaded_by AS "uploadedBy",
        created_at AS "createdAt"
    `, [...params, id])

    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
    }

    return row
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('Failed to update banner asset:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update banner asset' })
  }
})
