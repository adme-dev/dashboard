import { publishingDelivery } from '~~/server/utils/socialPublishing/deliveryReceipt'
import { createError } from 'h3'
import { z } from 'zod'
import { queryOneFresh, queryRowsFresh, transaction } from '~~/server/utils/db'

export const taskPublishingInput = z.object({ postId: z.string().uuid().optional() }).strict()
type Authorize = (clientId: string, boardId: string) => Promise<unknown>
interface TaskScope { id: string, project_id: string, brief_id: string | null, department_id: string, client_id: string, title: string }
const scopeSql = `SELECT t.id,t.project_id,t.brief_id,t.department_id,t.title,p.client_id
  FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=$1`
const linkedSql = `SELECT p.id,p.client_id,p.status,p.scheduled_at,p.published_at,p.account_ids,p.platforms,p.platform_results,p.metadata,l.client_id AS linked_client_id,l.project_id
  FROM task_publishing_links l JOIN social_posts p ON p.id=l.post_id WHERE l.task_id=$1`
function assertScope(task: TaskScope | undefined | null): asserts task is TaskScope {
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task with a client project not found' })
  if (!task.client_id) throw createError({ statusCode: 422, statusMessage: 'A client project is required before publishing handoff' })
}
function assertLink(task: TaskScope, post: Record<string, unknown>) {
  if (post.client_id !== task.client_id || post.linked_client_id !== task.client_id || post.project_id !== task.project_id) {
    throw createError({ statusCode: 409, statusMessage: 'Task or post ownership changed. Review this publishing link before continuing.' })
  }
}
function result(task: TaskScope, post: Record<string, unknown> | null) {
  return { clientId: task.client_id, projectId: task.project_id, briefId: task.brief_id,
    post: post ? { id: post.id, status: post.status, scheduledAt: post.scheduled_at, publishedAt: post.published_at, delivery: publishingDelivery(post) } : null }
}
export async function getTaskPublishing(taskId: string, authorize: Authorize) {
  const task = await queryOneFresh<TaskScope>(scopeSql, [taskId])
  assertScope(task)
  await authorize(task.client_id, task.department_id)
  const post = await queryOneFresh<Record<string, unknown>>(linkedSql, [taskId])
  if (post) assertLink(task, post)
  const drafts = post
    ? []
    : await queryRowsFresh(`SELECT p.id,LEFT(p.content,140) AS content
    FROM social_posts p WHERE p.client_id=$1 AND p.status='draft'
    AND p.approval_requested_at IS NULL AND p.approved_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM task_publishing_links l WHERE l.post_id=p.id)
    ORDER BY p.created_at DESC LIMIT 100`, [task.client_id])
  return { ...result(task, post), drafts }
}
export async function handoffTaskPublishing(taskId: string, actorId: string, input: { postId?: string }, authorize: Authorize) {
  return transaction(async (db) => {
    // Serialize retries on the task, and keep its project/client stable through the handoff.
    const task = (await db.query<TaskScope>(`${scopeSql} FOR UPDATE OF t,p`, [taskId])).rows[0]
    assertScope(task)
    await authorize(task.client_id, task.department_id)
    if (task.brief_id) {
      const brief = (await db.query('SELECT client_id FROM briefs WHERE id=$1 FOR SHARE', [task.brief_id])).rows[0]
      if (!brief || brief.client_id !== task.client_id) throw createError({ statusCode: 409, statusMessage: 'Source brief and project must belong to the same client' })
    }
    const linked = (await db.query(linkedSql, [taskId])).rows[0]
    if (linked) {
      assertLink(task, linked)
      if (input.postId && input.postId !== linked.id) throw createError({ statusCode: 409, statusMessage: 'This task already has a publishing draft' })
      return result(task, linked)
    }
    let post
    if (input.postId) {
      post = (await db.query('SELECT * FROM social_posts WHERE id=$1 FOR UPDATE', [input.postId])).rows[0]
      if (!post || post.client_id !== task.client_id || post.status !== 'draft' || post.approval_requested_at || post.approved_at) {
        throw createError({ statusCode: 409, statusMessage: 'Choose an unreviewed draft belonging to this task’s client' })
      }
      const used = (await db.query('SELECT task_id FROM task_publishing_links WHERE post_id=$1', [post.id])).rows[0]
      if (used) throw createError({ statusCode: 409, statusMessage: 'This draft is already linked to another task' })
    } else {
      post = (await db.query(`INSERT INTO social_posts(client_id,created_by,content,status,timezone,platforms)
        VALUES($1,$2,'','draft','Australia/Melbourne','{}') RETURNING *`, [task.client_id, actorId])).rows[0]
    }
    await db.query(`INSERT INTO task_publishing_links(task_id,post_id,client_id,project_id,brief_id,created_by)
      VALUES($1,$2,$3,$4,$5,$6)`, [taskId, post.id, task.client_id, task.project_id, task.brief_id, actorId])
    await db.query(`INSERT INTO social_publishing_audit_events(client_id,post_id,actor_id,action,metadata)
      VALUES($1,$2,$3,$4,$5::jsonb)`, [task.client_id, post.id, actorId, input.postId ? 'post_updated' : 'post_created', JSON.stringify({ event: 'task_publishing_linked', taskId, projectId: task.project_id, briefId: task.brief_id })])
    return result(task, post)
  })
}
