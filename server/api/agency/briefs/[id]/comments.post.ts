/**
 * Add comment to brief
 */

import { queryOne, execute } from '~~/server/utils/db'
import { getAuthUser } from '~~/server/utils/auth'
import { notifyBriefCommented } from '~~/server/utils/briefNotifications'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  const { content, parentId, isInternal = false, isResolution = false } = body

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Brief ID is required'
    })
  }

  if (!content?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Comment content is required'
    })
  }

  try {
    // Verify brief exists
    const brief = await queryOne('SELECT id FROM briefs WHERE id = $1', [id])
    if (!brief) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Brief not found'
      })
    }

    // Verify parent comment exists if provided
    if (parentId) {
      const parent = await queryOne(
        'SELECT id FROM brief_comments WHERE id = $1 AND brief_id = $2',
        [parentId, id]
      )
      if (!parent) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Parent comment not found'
        })
      }
    }

    // Get current user
    let userId = null
    try {
      const user = await getAuthUser(event)
      userId = user?.id || null
    } catch {}

    // Create comment
    const comment = await queryOne(`
      INSERT INTO brief_comments (brief_id, parent_id, user_id, content, is_internal, is_resolution)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, parentId || null, userId, content.trim(), isInternal, isResolution])

    // Log activity
    await execute(`
      INSERT INTO brief_activities (brief_id, user_id, activity_type, content)
      VALUES ($1, $2, 'commented', $3)
    `, [id, userId, isInternal ? 'Internal comment added' : 'Comment added'])

    // Notify watchers (fire-and-forget)
    const briefForNotif = await queryOne('SELECT title, reference_number FROM briefs WHERE id = $1', [id])
    if (briefForNotif && userId) {
      notifyBriefCommented({
        briefId: id,
        briefTitle: briefForNotif.title,
        referenceNumber: briefForNotif.reference_number,
        commenterId: userId,
        commentSnippet: content.trim().substring(0, 100),
        isInternal
      }).catch(err => console.error('[Brief] Comment notification error:', err))
    }

    // Get user info
    let user = null
    if (userId) {
      user = await queryOne(
        'SELECT id, name, email, avatar_url FROM team_members WHERE id = $1',
        [userId]
      )
    }

    return {
      id: comment.id,
      briefId: comment.brief_id,
      parentId: comment.parent_id,
      userId: comment.user_id,
      content: comment.content,
      isInternal: comment.is_internal,
      isResolution: comment.is_resolution,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: user ? {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url
      } : null
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create brief comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create brief comment'
    })
  }
})
