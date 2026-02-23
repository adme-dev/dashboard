/**
 * Get comments for a task (with threading support)
 * GET /api/tasks/:id/comments
 */

import { createError, getRouterParam, getQuery } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { queryRows, queryOne } from '../../../utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const taskId = getRouterParam(event, 'id')
  const query = getQuery(event)
  
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID required' })
  }

  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0
  const includeReplies = query.replies !== 'false'

  try {
    // Get task info for permission check
    const task = await queryOne(`
      SELECT t.id, t.department_id, d.workspace_id
      FROM tasks t
      JOIN departments d ON t.department_id = d.id
      WHERE t.id = $1
    `, [taskId])

    if (!task) {
      throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    }

    // Get top-level comments
    const comments = await queryRows(`
      SELECT 
        ta.id,
        ta.task_id,
        ta.user_id as author_id,
        tm.name as author_name,
        tm.avatar_url as author_avatar,
        ta.parent_id,
        ta.content,
        ta.is_internal,
        ta.created_at,
        ta.edited_at,
        (SELECT COUNT(*) FROM task_activities replies 
         WHERE replies.parent_id = ta.id AND replies.activity_type = 'comment' AND replies.is_deleted = false) as reply_count,
        (SELECT COUNT(*) FROM task_comment_reactions tcr 
         WHERE tcr.comment_id = ta.id AND tcr.reaction_type = 'like') as likes_count,
        EXISTS(
          SELECT 1 FROM task_comment_reactions 
          WHERE comment_id = ta.id AND user_id = $2 AND reaction_type = 'like'
        ) as user_has_liked,
        (SELECT jsonb_agg(jsonb_build_object(
          'userId', tcm.mentioned_user_id,
          'name', tm2.name,
          'mentionText', tcm.mention_text
        ))
        FROM task_comment_mentions tcm
        JOIN team_members tm2 ON tcm.mentioned_user_id = tm2.id
        WHERE tcm.comment_id = ta.id
        ) as mentions
      FROM task_activities ta
      JOIN team_members tm ON ta.user_id = tm.id
      WHERE ta.task_id = $1
        AND ta.activity_type = 'comment'
        AND ta.is_deleted = false
        AND ta.parent_id IS NULL
      ORDER BY ta.created_at DESC
      LIMIT $3 OFFSET $4
    `, [taskId, user.id, limit, offset])

    // If including replies, fetch them for each comment
    if (includeReplies && comments.length > 0) {
      const commentIds = comments.map((c: any) => c.id)
      
      const replies = await queryRows(`
        SELECT 
          ta.id,
          ta.task_id,
          ta.user_id as author_id,
          tm.name as author_name,
          tm.avatar_url as author_avatar,
          ta.parent_id,
          ta.content,
          ta.is_internal,
          ta.created_at,
          ta.edited_at,
          (SELECT COUNT(*) FROM task_comment_reactions tcr 
           WHERE tcr.comment_id = ta.id AND tcr.reaction_type = 'like') as likes_count,
          EXISTS(
            SELECT 1 FROM task_comment_reactions 
            WHERE comment_id = ta.id AND user_id = $1 AND reaction_type = 'like'
          ) as user_has_liked,
          (SELECT jsonb_agg(jsonb_build_object(
            'userId', tcm.mentioned_user_id,
            'name', tm2.name,
            'mentionText', tcm.mention_text
          ))
          FROM task_comment_mentions tcm
          JOIN team_members tm2 ON tcm.mentioned_user_id = tm2.id
          WHERE tcm.comment_id = ta.id
          ) as mentions
        FROM task_activities ta
        JOIN team_members tm ON ta.user_id = tm.id
        WHERE ta.parent_id = ANY($2::uuid[])
          AND ta.activity_type = 'comment'
          AND ta.is_deleted = false
        ORDER BY ta.created_at ASC
      `, [user.id, commentIds])

      // Attach replies to their parent comments
      const repliesByParent = replies.reduce((acc: any, reply: any) => {
        if (!acc[reply.parent_id]) acc[reply.parent_id] = []
        acc[reply.parent_id].push(reply)
        return acc
      }, {})

      comments.forEach((comment: any) => {
        comment.replies = repliesByParent[comment.id] || []
      })
    }

    return {
      comments,
      pagination: {
        limit,
        offset,
        hasMore: comments.length === limit
      }
    }

  } catch (error: any) {
    console.error('Failed to fetch comments:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch comments: ${error.message}`
    })
  }
})
