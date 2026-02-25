/**
 * PATCH /api/chat/channels/:channelId
 * Update channel settings (name, description, archive/unarchive).
 * Requires admin or owner role.
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  // Verify membership and role
  const membership = await queryOne(`
    SELECT role FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only admins and owners can update channel settings' })
  }

  const body = await readBody(event)
  const { name, description, archive } = body

  // Build dynamic SET clause
  const sets: string[] = []
  const params: any[] = []
  let idx = 1

  if (name !== undefined) {
    if (!name.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Channel name cannot be empty' })
    }
    sets.push(`name = $${idx}`)
    params.push(name.trim())
    idx++

    // Update slug
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    sets.push(`slug = $${idx}`)
    params.push(slug)
    idx++
  }

  if (description !== undefined) {
    sets.push(`description = $${idx}`)
    params.push(description || null)
    idx++
  }

  if (archive === true) {
    sets.push(`archived_at = NOW()`)
  } else if (archive === false) {
    sets.push(`archived_at = NULL`)
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  sets.push(`updated_at = NOW()`)
  params.push(channelId)

  const updated = await queryOne(`
    UPDATE chat_channels SET ${sets.join(', ')}
    WHERE id = $${idx}
    RETURNING *
  `, params)

  return updated
})
