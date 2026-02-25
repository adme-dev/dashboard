/**
 * Client Portal - List Comments
 * GET /api/portal/comments
 */

import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const query = getQuery(event)

  const projectId = query.projectId as string | undefined
  const approvalId = query.approvalId as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = ['cc.is_internal = false']
    const params: any[] = []
    let idx = 1

    // Scope to client's projects
    if (projectId) {
      conditions.push(`cc.project_id = $${idx}`)
      params.push(projectId)
      idx++
      // Verify project belongs to client
      conditions.push(`EXISTS (SELECT 1 FROM projects WHERE id = cc.project_id AND client_id = $${idx})`)
      params.push(clientUser.clientId)
      idx++
    }

    if (approvalId) {
      conditions.push(`cc.approval_id = $${idx}`)
      params.push(approvalId)
      idx++
    }

    params.push(limit)

    const comments = await queryRows(`
      SELECT
        cc.id, cc.content, cc.attachments, cc.is_resolved,
        cc.parent_comment_id, cc.created_at, cc.updated_at,
        cc.project_id, cc.approval_id,
        cu.id as client_user_id, cu.name as client_user_name, cu.avatar_url as client_user_avatar,
        tm.id as team_member_id, tm.name as team_member_name, tm.avatar_url as team_member_avatar
      FROM client_comments cc
      LEFT JOIN client_users cu ON cc.client_user_id = cu.id
      LEFT JOIN team_members tm ON cc.team_member_id = tm.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY cc.created_at ASC
      LIMIT $${idx}
    `, params)

    return {
      comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        attachments: c.attachments,
        isResolved: c.is_resolved,
        parentCommentId: c.parent_comment_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        projectId: c.project_id,
        approvalId: c.approval_id,
        author: c.client_user_id
          ? { type: 'client', id: c.client_user_id, name: c.client_user_name, avatarUrl: c.client_user_avatar }
          : { type: 'team', id: c.team_member_id, name: c.team_member_name, avatarUrl: c.team_member_avatar }
      }))
    }
  } catch (error) {
    console.error('Failed to fetch comments:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch comments' })
  }
})
