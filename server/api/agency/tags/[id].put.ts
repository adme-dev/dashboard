/**
 * Update Global Tag
 * PUT /api/agency/tags/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateTagBody {
  name?: string
  color?: string
  description?: string
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateTagBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tag ID is required'
    })
  }

  // Check tag exists
  const existing = await queryOne('SELECT * FROM global_tags WHERE id = $1', [id])
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Tag not found'
    })
  }

  const updates: string[] = []
  const params: any[] = []

  if (body.name !== undefined && body.name.trim()) {
    const name = body.name.trim()
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    // Check if new slug conflicts with another tag
    const conflict = await queryOne(
      'SELECT id FROM global_tags WHERE slug = $1 AND id != $2',
      [slug, id]
    )
    if (conflict) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A tag with this name already exists'
      })
    }

    params.push(name)
    updates.push(`name = $${params.length}`)
    params.push(slug)
    updates.push(`slug = $${params.length}`)
  }

  if (body.color !== undefined) {
    params.push(body.color)
    updates.push(`color = $${params.length}`)
  }

  if (body.description !== undefined) {
    params.push(body.description || null)
    updates.push(`description = $${params.length}`)
  }

  if (updates.length === 0) {
    return {
      id: existing.id,
      name: existing.name,
      slug: existing.slug,
      color: existing.color,
      description: existing.description,
      usageCount: existing.usage_count,
      createdBy: existing.created_by,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at
    }
  }

  params.push(id)
  const tag = await queryOne(`
    UPDATE global_tags
    SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $${params.length}
    RETURNING *
  `, params)

  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    color: tag.color,
    description: tag.description,
    usageCount: tag.usage_count,
    createdBy: tag.created_by,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at
  }
})
