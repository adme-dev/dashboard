import { queryOne as realQueryOne } from '~~/server/utils/db'
import type { AiContextSource } from '~/types'
import type { PersonalAssistantContext } from './personalAssistantContext'

export interface MentionedEntityContextDb {
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>
}

const defaultDb: MentionedEntityContextDb = {
  queryOne: realQueryOne as MentionedEntityContextDb['queryOne']
}

type MentionedEntity = { type: string, id: string }
type TaskMentionRow = {
  id: string
  title: string
  status: string | null
  description: string | null
  due_date: string | Date | null
  project_name: string | null
  assignee_name: string | null
}
type ClientMentionRow = {
  id: string
  name: string
  billing_type: string | null
  brief_count: number
}
type ProjectMentionRow = {
  id: string
  name: string
  status: string | null
  description: string | null
  budget_amount: number | string | null
  client_name: string | null
  task_count: number
}
type BriefMentionRow = {
  id: string
  title: string
  status: string | null
  description: string | null
  client_name: string | null
}

function clientPredicate(
  context: PersonalAssistantContext,
  clientColumn: string
): { sql: string, params: string[][] } {
  if (context.clientScope.mode === 'assigned') {
    return {
      sql: `AND ${clientColumn} = ANY($2::uuid[])`,
      params: [context.clientScope.assignments.map(assignment => assignment.clientId)]
    }
  }
  return { sql: '', params: [] }
}

/**
 * Resolve explicit @mentions through the same server-derived authority as automatic retrieval.
 * Mention identifiers are untrusted hints: a foreign UUID returns no context rather than bypassing
 * department/client isolation.
 */
export async function fetchScopedMentionedEntities(
  entities: MentionedEntity[],
  context: PersonalAssistantContext,
  db: MentionedEntityContextDb = defaultDb
): Promise<AiContextSource[]> {
  const results: AiContextSource[] = []
  const departmentIds = context.departments.map(department => department.departmentId)
  const assignedClientIds = context.clientScope.assignments.map(assignment => assignment.clientId)

  for (const entity of entities) {
    try {
      if (entity.type === 'task') {
        if (departmentIds.length === 0) continue
        const row = await db.queryOne<TaskMentionRow>(
          `SELECT t.id, t.title, t.status, t.description, t.due_date,
                  p.name AS project_name,
                  tm.name AS assignee_name
             FROM tasks t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN team_members tm ON tm.id = t.assignee_id
            WHERE t.id = $1
              AND t.department_id = ANY($2::uuid[])`,
          [entity.id, departmentIds]
        )
        if (row) {
          const parts = [
            `Status: ${row.status || 'todo'}`,
            row.project_name ? `Project: ${row.project_name}` : null,
            row.assignee_name ? `Assignee: ${row.assignee_name}` : null,
            row.due_date ? `Due: ${new Date(row.due_date).toLocaleDateString()}` : null,
            row.description ? row.description.slice(0, 150) : null
          ].filter(Boolean)
          results.push({
            type: 'task',
            id: row.id,
            title: row.title,
            snippet: parts.join(' | '),
            url: `/agency/tasks/${row.id}`
          })
        }
        continue
      }

      if (context.clientScope.mode === 'assigned' && assignedClientIds.length === 0) continue

      if (entity.type === 'client') {
        const predicate = clientPredicate(context, 'ac.id')
        const row = await db.queryOne<ClientMentionRow>(
          `SELECT ac.id, ac.name, ac.is_active, ac.billing_type,
                  COUNT(DISTINCT br.id)::int AS brief_count
             FROM agency_clients ac
             LEFT JOIN briefs br ON br.client_id = ac.id
            WHERE ac.id = $1
              AND ac.is_active = TRUE
              ${predicate.sql}
            GROUP BY ac.id`,
          [entity.id, ...predicate.params]
        )
        if (row) {
          const parts = [
            'Status: active',
            row.billing_type ? `Billing: ${row.billing_type}` : null,
            `${row.brief_count} brief${row.brief_count === 1 ? '' : 's'}`
          ].filter(Boolean)
          results.push({
            type: 'client',
            id: row.id,
            title: row.name,
            snippet: parts.join(' | '),
            url: `/agency/clients/${row.id}`
          })
        }
        continue
      }

      if (entity.type === 'project') {
        const predicate = clientPredicate(context, 'p.client_id')
        const row = await db.queryOne<ProjectMentionRow>(
          `SELECT p.id, p.name, p.status, p.description, p.budget_amount,
                  ac.name AS client_name,
                  COUNT(t.id)::int AS task_count
             FROM projects p
             JOIN agency_clients ac ON ac.id = p.client_id
             LEFT JOIN tasks t ON t.project_id = p.id
            WHERE p.id = $1
              AND ac.is_active = TRUE
              ${predicate.sql}
            GROUP BY p.id, ac.name`,
          [entity.id, ...predicate.params]
        )
        if (row) {
          const parts = [
            `Status: ${row.status || 'draft'}`,
            row.client_name ? `Client: ${row.client_name}` : null,
            `${row.task_count} tasks`,
            row.budget_amount ? `Budget: $${Number(row.budget_amount).toLocaleString()}` : null,
            row.description ? row.description.slice(0, 100) : null
          ].filter(Boolean)
          results.push({
            type: 'project',
            id: row.id,
            title: row.name,
            snippet: parts.join(' | '),
            url: `/agency/projects/${row.id}`
          })
        }
        continue
      }

      if (entity.type === 'brief') {
        const predicate = clientPredicate(context, 'br.client_id')
        const row = await db.queryOne<BriefMentionRow>(
          `SELECT br.id, br.title, br.status, br.description,
                  ac.name AS client_name
             FROM briefs br
             JOIN agency_clients ac ON ac.id = br.client_id
            WHERE br.id = $1
              AND ac.is_active = TRUE
              ${predicate.sql}`,
          [entity.id, ...predicate.params]
        )
        if (row) {
          const parts = [
            `Status: ${row.status || 'draft'}`,
            row.client_name ? `Client: ${row.client_name}` : null,
            row.description ? row.description.slice(0, 100) : null
          ].filter(Boolean)
          results.push({
            type: 'brief',
            id: row.id,
            title: row.title,
            snippet: parts.join(' | '),
            url: `/agency/briefs/${row.id}`
          })
        }
      }
    } catch (error) {
      console.error(`Failed to fetch mentioned entity ${entity.type}:${entity.id}`, error)
    }
  }

  return results
}
