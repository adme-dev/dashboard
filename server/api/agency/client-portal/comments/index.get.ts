/**
 * List Client Comments
 * GET /api/agency/client-portal/comments
 *
 * Query params:
 * - projectId: Filter by project
 * - taskId: Filter by task
 * - approvalId: Filter by approval
 * - invoiceId: Filter by invoice
 * - clientUserId: Filter by client user
 * - includeInternal: Include internal notes (agency only)
 * - limit: Max results
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const projectId = query.projectId as string | undefined
  const taskId = query.taskId as string | undefined
  const approvalId = query.approvalId as string | undefined
  const invoiceId = query.invoiceId as string | undefined
  const clientUserId = query.clientUserId as string | undefined
  const includeInternal = query.includeInternal === 'true'
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (projectId) {
      conditions.push(`cc.project_id = $${idx}`)
      params.push(projectId)
      idx++
    }

    if (taskId) {
      conditions.push(`cc.task_id = $${idx}`)
      params.push(taskId)
      idx++
    }

    if (approvalId) {
      conditions.push(`cc.approval_id = $${idx}`)
      params.push(approvalId)
      idx++
    }

    if (invoiceId) {
      conditions.push(`cc.invoice_id = $${idx}`)
      params.push(invoiceId)
      idx++
    }

    if (clientUserId) {
      conditions.push(`cc.client_user_id = $${idx}`)
      params.push(clientUserId)
      idx++
    }

    // By default, exclude internal notes (only visible to agency)
    if (!includeInternal) {
      conditions.push('cc.is_internal = false')
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit)

    const comments = await queryRows(`
      SELECT
        cc.id,
        cc.content,
        cc.attachments,
        cc.is_internal,
        cc.is_resolved,
        cc.parent_comment_id,
        cc.created_at,
        cc.updated_at,
        cc.project_id,
        cc.task_id,
        cc.approval_id,
        cc.invoice_id,
        p.name as project_name,
        t.title as task_title,
        ca.title as approval_title,
        cu.id as client_user_id,
        cu.name as client_user_name,
        cu.avatar_url as client_user_avatar,
        tm.id as team_member_id,
        tm.name as team_member_name,
        tm.avatar_url as team_member_avatar
      FROM client_comments cc
      LEFT JOIN projects p ON cc.project_id = p.id
      LEFT JOIN tasks t ON cc.task_id = t.id
      LEFT JOIN client_approvals ca ON cc.approval_id = ca.id
      LEFT JOIN client_users cu ON cc.client_user_id = cu.id
      LEFT JOIN team_members tm ON cc.team_member_id = tm.id
      ${whereClause}
      ORDER BY cc.created_at DESC
      LIMIT $${idx}
    `, params)

    return {
      comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        attachments: c.attachments,
        isInternal: c.is_internal,
        isResolved: c.is_resolved,
        parentCommentId: c.parent_comment_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        context: {
          projectId: c.project_id,
          projectName: c.project_name,
          taskId: c.task_id,
          taskTitle: c.task_title,
          approvalId: c.approval_id,
          approvalTitle: c.approval_title,
          invoiceId: c.invoice_id
        },
        author: c.client_user_id ? {
          type: 'client',
          id: c.client_user_id,
          name: c.client_user_name,
          avatarUrl: c.client_user_avatar
        } : {
          type: 'team',
          id: c.team_member_id,
          name: c.team_member_name,
          avatarUrl: c.team_member_avatar
        }
      }))
    }
  } catch (error) {
    console.error('Failed to fetch comments:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch comments'
    })
  }
})
