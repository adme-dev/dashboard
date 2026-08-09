import { createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

export type CrmRecordType = 'person' | 'company' | 'opportunity' | 'activity' | 'task'

export interface CrmRecordRef {
  type: CrmRecordType
  id: string
}

export interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

export interface CrmVisibilityCondition {
  sql: string
  params: unknown[]
}

export interface AuthoritativeCrmRecord {
  type: CrmRecordType
  id: string
  clientId: string
  row: Record<string, unknown>
}

type TargetType = Extract<CrmRecordType, 'person' | 'company' | 'opportunity'>

const recordTables: Record<CrmRecordType, string> = {
  person: 'crm_people',
  company: 'crm_companies',
  opportunity: 'crm_opportunities',
  activity: 'crm_activities',
  task: 'crm_tasks'
}

const defaultAliases: Record<CrmRecordType, string> = {
  person: 'person',
  company: 'company',
  opportunity: 'opportunity',
  activity: 'activity',
  task: 'task'
}

function recordNotFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Record not found' })
}

function safeAlias(alias: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid CRM SQL alias')
  return alias
}

function ownerVisibilityApplies(context: CrmSearchContext) {
  return context.actorType === 'staff' && context.visibility.ownerScoped
}

function targetVisibility(context: CrmSearchContext, sourceAlias: string): CrmVisibilityCondition {
  const alias = safeAlias(sourceAlias)
  const branch = (type: TargetType, table: string) => `(
      ${alias}.target_type = '${type}'
      AND EXISTS (
        SELECT 1 FROM ${table} target
         WHERE target.id = ${alias}.target_id
           AND target.client_id = ${alias}.client_id
           AND target.deleted_at IS NULL
           AND (target.owner_id = ? OR target.assigned_to = ?)
      )
    )`
  return {
    sql: `(${[
      branch('person', recordTables.person),
      branch('company', recordTables.company),
      branch('opportunity', recordTables.opportunity)
    ].join(' OR ')})`,
    params: [
      context.actorId, context.actorId,
      context.actorId, context.actorId,
      context.actorId, context.actorId
    ]
  }
}

/**
 * Builds the canonical owner-scope fragment for a CRM table alias. The caller
 * still supplies the mandatory client/deletion predicates. Portal and team
 * contexts intentionally add no staff-owner predicate.
 */
export function crmVisibilityCond(
  context: CrmSearchContext,
  type: CrmRecordType,
  sourceAlias = defaultAliases[type]
): CrmVisibilityCondition | null {
  if (!ownerVisibilityApplies(context)) return null
  const alias = safeAlias(sourceAlias)
  if (type === 'person' || type === 'company' || type === 'opportunity') {
    return {
      sql: `(${alias}.owner_id = ? OR ${alias}.assigned_to = ?)`,
      params: [context.actorId, context.actorId]
    }
  }
  const target = targetVisibility(context, alias)
  if (type === 'activity') return target
  return {
    sql: `(${alias}.assigned_to = ? OR ${alias}.created_by = ? OR ${target.sql})`,
    params: [context.actorId, context.actorId, ...target.params]
  }
}

function numberCondition(condition: CrmVisibilityCondition, startingIndex: number) {
  let index = startingIndex
  const sql = condition.sql.replace(/\?/g, () => `$${++index}`)
  if (index - startingIndex !== condition.params.length) {
    throw new Error('CRM visibility condition placeholder mismatch')
  }
  return sql
}

async function runRows(
  client: TransactionClient | undefined,
  sql: string,
  params: readonly unknown[]
): Promise<Record<string, unknown>[]> {
  if (client) {
    const result = await client.query(sql, [...params])
    return (result.rows ?? []) as Record<string, unknown>[]
  }
  return await queryRows<Record<string, unknown>>(sql, [...params])
}

function targetRef(row: Record<string, unknown>): CrmRecordRef {
  const type = row.target_type
  const id = row.target_id
  if ((type !== 'person' && type !== 'company' && type !== 'opportunity') || typeof id !== 'string') {
    recordNotFound()
  }
  return { type, id }
}

async function loadBaseRecord(
  context: CrmSearchContext,
  ref: CrmRecordRef,
  client?: TransactionClient,
  includeVisibility = true
) {
  const alias = defaultAliases[ref.type]
  const visibility = includeVisibility ? crmVisibilityCond(context, ref.type, alias) : null
  const visibilitySql = visibility ? ` AND ${numberCondition(visibility, 2)}` : ''
  const lockSql = client ? ` FOR UPDATE OF ${alias}` : ''
  const params = [ref.id, context.clientId, ...(visibility?.params ?? [])]
  const rows = await runRows(
    client,
    `SELECT ${alias}.*
       FROM ${recordTables[ref.type]} ${alias}
      WHERE ${alias}.id = $1
        AND ${alias}.client_id = $2
        AND ${alias}.deleted_at IS NULL${visibilitySql}${lockSql}`,
    params
  )
  if (rows.length !== 1) recordNotFound()
  return rows[0]!
}

/**
 * Reloads a record from the context-owned client and returns only its current
 * authoritative row. Supplying a transaction client locks every row whose
 * state participates in the decision before a caller mutates anything.
 */
export async function requireCrmRecordAccess(
  context: CrmSearchContext,
  ref: CrmRecordRef,
  client?: TransactionClient
): Promise<AuthoritativeCrmRecord> {
  if (ref.type === 'person' || ref.type === 'company' || ref.type === 'opportunity') {
    const row = await loadBaseRecord(context, ref, client)
    return { type: ref.type, id: ref.id, clientId: context.clientId, row }
  }

  // Child rows are locked first, then their current target is locked and
  // authorized in the same transaction. A concurrently stale/missing target
  // therefore cannot turn a known child ID into a bypass.
  const row = await loadBaseRecord(context, ref, client, false)
  if (ref.type === 'activity') {
    await requireCrmRecordAccess(context, targetRef(row), client)
    return { type: ref.type, id: ref.id, clientId: context.clientId, row }
  }

  if (!ownerVisibilityApplies(context)
    || row.assigned_to === context.actorId
    || row.created_by === context.actorId) {
    return { type: ref.type, id: ref.id, clientId: context.clientId, row }
  }
  await requireCrmRecordAccess(context, targetRef(row), client)
  return { type: ref.type, id: ref.id, clientId: context.clientId, row }
}

/**
 * Authorizes a complete relation/batch set before returning any rows to a
 * mutation caller. An empty set is valid; one hidden or missing member yields
 * the same non-disclosing record response as every other lookup.
 */
export async function requireAllCrmRecordsAccess(
  context: CrmSearchContext,
  refs: readonly CrmRecordRef[],
  client?: TransactionClient
): Promise<readonly AuthoritativeCrmRecord[]> {
  const records: AuthoritativeCrmRecord[] = []
  for (const ref of refs) records.push(await requireCrmRecordAccess(context, ref, client))
  return records
}
