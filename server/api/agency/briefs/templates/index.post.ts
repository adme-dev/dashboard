/**
 * Create a new brief template
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ['admin', 'owner'])
  const body = await readBody(event)

  const {
    categoryId, name, description, icon, isMultiStep, requiresApproval,
    defaultPriority, allowAttachments, maxAttachments, isPublic,
    requireClientLink, allowDrafts, showProgress, sortOrder
  } = body

  if (!categoryId || !name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Category and name are required' })
  }

  // Generate slug from name
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  try {
    const template = await queryOne(`
      INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, max_attachments, is_public, require_client_link, allow_drafts, show_progress, sort_order, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, slug, name
    `, [
      categoryId, name.trim(), slug, description || null,
      icon || 'i-lucide-file-text', isMultiStep ?? false,
      requiresApproval ?? false, defaultPriority || 'medium',
      allowAttachments ?? true, maxAttachments || 10,
      isPublic ?? true, requireClientLink ?? false,
      allowDrafts ?? true, showProgress ?? true,
      sortOrder || 0, user.id
    ])

    return { id: template.id, slug: template.slug, name: template.name }
  } catch (error: any) {
    if (error.message?.includes('unique') || error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'A template with this name already exists' })
    }
    console.error('Failed to create brief template:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create brief template' })
  }
})
