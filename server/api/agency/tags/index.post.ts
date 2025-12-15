/**
 * Create Global Tag
 * POST /api/agency/tags
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateTagBody {
  name: string
  color?: string
  description?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateTagBody>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tag name is required'
    })
  }

  const name = body.name.trim()
  // Create slug from name: lowercase, replace spaces with hyphens, remove special chars
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tag name must contain at least one alphanumeric character'
    })
  }

  // Check for existing tag
  const existing = await queryOne('SELECT id FROM global_tags WHERE slug = $1', [slug])
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A tag with this name already exists'
    })
  }

  const tag = await queryOne(`
    INSERT INTO global_tags (name, slug, color, description, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [
    name,
    slug,
    body.color || '#6B7280',
    body.description || null,
    user.id
  ])

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
