/**
 * Create a new team
 * POST /api/teams
 */

import { requireAuth } from '../../utils/auth'
import { queryOne } from '../../utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Team name is required' })
  }

  // Generate slug
  const slug = body.name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  try {
    const team = await queryOne(`
      INSERT INTO teams (name, slug, description, icon, color, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      body.name.trim(),
      slug,
      body.description || null,
      body.icon || 'i-lucide-users',
      body.color || '#6B7280',
      user.id
    ])

    return { team }
  } catch (err: any) {
    if (err.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Team with this name already exists' })
    }
    throw createError({ statusCode: 500, statusMessage: 'Failed to create team' })
  }
})
