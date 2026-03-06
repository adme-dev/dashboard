/**
 * Update brief template metadata
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['admin', 'owner'])

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const body = await readBody(event)
  const {
    categoryId, name, description, icon, isMultiStep, requiresApproval,
    defaultPriority, allowAttachments, maxAttachments, isPublic,
    requireClientLink, allowDrafts, showProgress, sortOrder
  } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  try {
    const template = await queryOne(`
      UPDATE brief_templates SET
        category_id = COALESCE($2, category_id),
        name = $3,
        description = $4,
        icon = COALESCE($5, icon),
        is_multi_step = COALESCE($6, is_multi_step),
        requires_approval = COALESCE($7, requires_approval),
        default_priority = COALESCE($8, default_priority),
        allow_attachments = COALESCE($9, allow_attachments),
        max_attachments = COALESCE($10, max_attachments),
        is_public = COALESCE($11, is_public),
        require_client_link = COALESCE($12, require_client_link),
        allow_drafts = COALESCE($13, allow_drafts),
        show_progress = COALESCE($14, show_progress),
        sort_order = COALESCE($15, sort_order),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, slug, name
    `, [
      id, categoryId || null, name.trim(), description || null,
      icon || null, isMultiStep ?? null, requiresApproval ?? null,
      defaultPriority || null, allowAttachments ?? null,
      maxAttachments ?? null, isPublic ?? null,
      requireClientLink ?? null, allowDrafts ?? null,
      showProgress ?? null, sortOrder ?? null
    ])

    if (!template) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    return template
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update brief template:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update brief template' })
  }
})
