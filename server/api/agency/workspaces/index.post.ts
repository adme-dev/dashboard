/**
 * Create new workspace
 * POST /api/agency/workspaces
 */

import { requireAuth } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { name, description, color = '#3B82F6', privacy = 'open', templateId } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace name is required' })
  }

  try {
    // Generate slug from name
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .substring(0, 50)

    // Check if slug already exists
    const existing = await queryOne(
      'SELECT id FROM workspaces WHERE slug = $1',
      [slug]
    )

    if (existing) {
      throw createError({ statusCode: 409, statusMessage: 'A workspace with this name already exists' })
    }

    // Create workspace
    const workspace = await queryOne<{
      id: string
      name: string
      slug: string
      color: string
      description: string
      is_private: boolean
      created_at: string
    }>(`
      INSERT INTO workspaces (name, slug, description, color, is_private, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, name, slug, color, description, is_private, created_at
    `, [name.trim(), slug, description || null, color, privacy === 'closed'])

    // If template was selected, create initial boards from template
    if (templateId) {
      // TODO: Implement template-based board creation
      console.log(`Creating boards from template: ${templateId}`)
    }

    return {
      success: true,
      workspace: {
        id: workspace!.id,
        name: workspace!.name,
        slug: workspace!.slug,
        color: workspace!.color,
        description: workspace!.description,
        isPrivate: workspace!.is_private,
        createdAt: workspace!.created_at
      }
    }

  } catch (error: any) {
    console.error('[Workspaces Create] Error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create workspace: ${error.message}`
    })
  }
})
