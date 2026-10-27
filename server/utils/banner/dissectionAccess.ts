import { createError } from 'h3'
import { z } from 'zod'
import { dissectionIngestionSchema, dissectionSourceSchema, type DissectionOwner } from '../../../shared/bannerDissectionIngestion'

/** Pass the client from transactionWithoutRetry, never a cached query adapter. */
export interface DissectionAccessDb {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}
export type DissectionAccessMode = 'read' | 'write' | 'execute'
export interface DissectionAccessRecord { user_id: string, manifest?: unknown }
export interface DissectionOwnerInput { projectId?: string, clientId?: string, source?: unknown }
export interface DissectionResolvedOwner { owner: DissectionOwner, sessionsInvalidatedAt: string | null }
export interface DissectionHistoryOptions { alias?: string, parameterOffset?: number, projectId?: string, clientId?: string }
export interface DissectionHistorySql { sql: string, params: unknown[] }

interface Actor {
  id: string
  user_role: string
  custom_role_id: string | null
  is_active: boolean
  sessions_invalidated_at: Date | string | null
}
interface Authority { actor: Actor, marker: string | null, allClients: boolean, scoped: boolean }
interface Project { id: string, client_id: string | null, created_by: string }
const denied = () => createError({ statusCode: 403, statusMessage: 'No access to this dissection' })
const invalid = () => createError({ statusCode: 400, statusMessage: 'Invalid dissection ownership input' })
const uuid = z.string().uuid()
function id(value: unknown): string {
  const result = uuid.safeParse(value)
  if (!result.success) throw invalid()
  return result.data.toLowerCase()
}
function marker(value: Actor['sessions_invalidated_at']): string | null {
  if (value === null) return null
  if (!(typeof value === 'string' || value instanceof Date)) throw denied()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw denied()
  return date.toISOString()
}
async function rows<T>(db: DissectionAccessDb, sql: string, params: unknown[]): Promise<T[]> {
  try {
    return (await db.query<T>(sql, params)).rows
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Dissection authority temporarily unavailable' })
  }
}

// No roleResolver/KV, static role fallback, request claims, environment or implicit
// god-mode elevation. Dissector has no audited exact-route bypass coordinator.
async function authority(db: DissectionAccessDb, actorId: string, mode: DissectionAccessMode): Promise<Authority> {
  if (!['read', 'write', 'execute'].includes(mode)) throw invalid()
  const actor = (await rows<Actor>(db, `SELECT id, user_role, custom_role_id, is_active, sessions_invalidated_at
    FROM team_members WHERE id = $1 FOR SHARE`, [actorId]))[0]
  if (!actor || actor.id !== actorId || actor.is_active !== true) throw denied()
  const role = (await rows<{ id: string, is_read_only: boolean }>(db,
    actor.custom_role_id
      ? 'SELECT id, is_read_only FROM custom_roles WHERE id = $1 FOR SHARE'
      : 'SELECT id, is_read_only FROM custom_roles WHERE slug = $1 AND is_system = TRUE FOR SHARE',
    [actor.custom_role_id || actor.user_role]))[0]
  if (!role || typeof role.is_read_only !== 'boolean') throw denied()
  const groups = (await rows<{ permission_group: string }>(db,
    'SELECT permission_group FROM role_permission_groups WHERE role_id = $1 ORDER BY id FOR SHARE', [role.id]))
    .map(row => row.permission_group)
  if (mode !== 'read' && (role.is_read_only || ['viewer', 'guest'].includes(actor.user_role))) throw denied()
  return { actor, marker: marker(actor.sessions_invalidated_at),
    allClients: groups.some(group => ['ADMIN', 'MANAGEMENT'].includes(group)),
    scoped: groups.some(group => ['CLIENTS', 'CREATIVE', 'MEDIA_BUYING'].includes(group)) }
}
async function clientAccess(db: DissectionAccessDb, auth: Authority, clientId: string): Promise<void> {
  if (!auth.scoped) throw denied()
  // Existence must be checked even for administrators (and retained under a lock).
  if (!(await rows(db, 'SELECT id FROM agency_clients WHERE id = $1 FOR SHARE', [clientId])).length) throw denied()
  if (!auth.allClients && !(await rows(db,
    'SELECT id FROM client_team_assignments WHERE client_id = $1 AND team_member_id = $2 FOR SHARE',
    [clientId, auth.actor.id])).length) throw denied()
}
async function projectAccess(db: DissectionAccessDb, auth: Authority, projectId: string): Promise<Project> {
  const project = (await rows<Project>(db,
    'SELECT id, client_id, created_by FROM banner_projects WHERE id = $1 FOR SHARE', [projectId]))[0]
  if (!project) throw denied()
  if (project.client_id !== null) await clientAccess(db, auth, project.client_id)
  else if (project.created_by !== auth.actor.id && !auth.allClients) throw denied()
  return project
}

/** Resolve twice around slow I/O, comparing frozen ownership before the final insert. */
export async function resolveDissectionOwner(
  db: DissectionAccessDb, actorId: string, input: DissectionOwnerInput, mode: DissectionAccessMode = 'write'
): Promise<DissectionResolvedOwner> {
  const userId = id(actorId)
  const parsed = z.object({ projectId: uuid.optional(), clientId: uuid.optional(), source: z.unknown().optional() }).strict().safeParse(input)
  if (!parsed.success) throw invalid()
  const projectId = input.projectId === undefined ? undefined : id(input.projectId)
  const clientId = input.clientId === undefined ? undefined : id(input.clientId)
  if ((projectId || clientId || input.source !== undefined) && !dissectionSourceSchema.safeParse(input.source).success) throw invalid()
  return resolveDissectionContext(db, userId, { ...(projectId ? { projectId } : {}), ...(clientId ? { clientId } : {}) }, mode)
}

/** Fresh target/context authority, without claiming any uploaded bytes were verified. */
export async function resolveDissectionContext(
  db: DissectionAccessDb, actorId: string,
  input: { projectId?: string, clientId?: string }, mode: DissectionAccessMode = 'read'
): Promise<DissectionResolvedOwner> {
  const userId = id(actorId)
  const parsed = z.object({ projectId: uuid.optional(), clientId: uuid.optional() }).strict().safeParse(input)
  if (!parsed.success) throw invalid()
  const projectId = input.projectId === undefined ? undefined : id(input.projectId)
  const clientId = input.clientId === undefined ? undefined : id(input.clientId)
  const auth = await authority(db, userId, mode)
  let owner: DissectionOwner = { kind: 'user', userId }
  if (projectId) {
    const project = await projectAccess(db, auth, projectId)
    if (clientId !== undefined && clientId !== project.client_id) throw denied()
    owner = { kind: 'project', userId, projectId: project.id, projectOwnerId: project.created_by, clientId: project.client_id }
  } else if (clientId) {
    await clientAccess(db, auth, clientId)
    owner = { kind: 'client', userId, clientId }
  }
  return { owner, sessionsInvalidatedAt: auth.marker }
}

/** record must be loaded from banner_dissections by the caller in this transaction.
 * Execute callers take actorId from that row's user_id, never the queue message.
 */
export async function assertDissectionAccess(
  db: DissectionAccessDb, actorId: string, record: DissectionAccessRecord, mode: DissectionAccessMode
): Promise<void> {
  const userId = id(actorId)
  if (record.user_id !== userId) throw denied()
  const auth = await authority(db, userId, mode)
  const manifest = record.manifest
  if (manifest == null) return // Historical SQL NULL means uploader-private.
  if (typeof manifest !== 'object' || Array.isArray(manifest)) throw denied()
  const data = manifest as Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key)
  if (has('source') && !dissectionSourceSchema.safeParse(data.source).success) throw denied()
  if (!has('ingestion')) return // Neither source nor import destination grants scope.
  const parsed = dissectionIngestionSchema.safeParse(data.ingestion)
  if (!parsed.success || !has('source')) throw denied()
  const { owner, sessionsInvalidatedAt } = parsed.data
  if (owner.userId !== userId || sessionsInvalidatedAt !== auth.marker) throw denied()
  if (owner.kind === 'client') await clientAccess(db, auth, owner.clientId)
  if (owner.kind === 'project') {
    const project = await projectAccess(db, auth, owner.projectId)
    if (project.created_by !== owner.projectOwnerId || project.client_id !== owner.clientId) throw denied()
  }
}

/** Predicate only: apply in WHERE before ORDER/LIMIT using the same transaction.
 * Then assertDissectionAccess on each selected row before returning any projection.
 * This second check validates complete metadata and locks its current scope rows.
 * Never reuse the predicate/params or its captured role grants across transactions.
 */
export async function dissectionHistoryScope(
  db: DissectionAccessDb, actorId: string, options: DissectionHistoryOptions = {}
): Promise<DissectionHistorySql> {
  const userId = id(actorId)
  const alias = options.alias ?? 'd'
  const offset = options.parameterOffset ?? 0
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias) || !Number.isSafeInteger(offset) || offset < 0 || offset > 60000) throw invalid()
  const projectId = options.projectId === undefined ? undefined : id(options.projectId)
  const clientId = options.clientId === undefined ? undefined : id(options.clientId)
  const auth = await authority(db, userId, 'read')
  const params: unknown[] = []
  const param = (value: unknown) => {
    params.push(value)
    return `$${offset + params.length}`
  }
  const actor = param(userId), session = param(auth.marker)
  const all = auth.allClients ? 'TRUE' : 'FALSE', scoped = auth.scoped ? 'TRUE' : 'FALSE'
  const m = `${alias}.manifest`, i = `(${m}->'ingestion')`, o = `(${i}->'owner')`
  const clientScope = (expression: string) => `(${scoped} AND EXISTS (
    SELECT 1 FROM agency_clients dc WHERE dc.id::text = ${expression}
      AND (${all} OR EXISTS (SELECT 1 FROM client_team_assignments da
        WHERE da.client_id = dc.id AND da.team_member_id = ${actor}::uuid))))`
  const conditions = [
    `${alias}.user_id = ${actor}::uuid`,
    `(${m} IS NULL OR ${m} = 'null'::jsonb OR (jsonb_typeof(${m}) = 'object' AND (
      NOT (${m} ? 'ingestion') OR (
        jsonb_typeof(${i}) = 'object' AND ${i}->'version' = '1'::jsonb
        AND jsonb_typeof(${m}->'source') = 'object'
        AND ${m}->'source'->'version' = '1'::jsonb AND ${m}->'source'->>'mimeType' = 'image/png'
        AND ${o}->>'userId' = ${actor}::text
        AND ${i} ? 'sessionsInvalidatedAt'
        AND (${i}->>'sessionsInvalidatedAt') IS NOT DISTINCT FROM ${session}::text
        AND (
          (${o}->>'kind' = 'user')
          OR (${o}->>'kind' = 'client' AND ${clientScope(`${o}->>'clientId'`)})
          OR (${o}->>'kind' = 'project' AND EXISTS (
            SELECT 1 FROM banner_projects dp WHERE dp.id::text = ${o}->>'projectId'
              AND dp.created_by::text = ${o}->>'projectOwnerId'
              AND ${o} ? 'clientId'
              AND dp.client_id::text IS NOT DISTINCT FROM ${o}->>'clientId'
              AND ((dp.client_id IS NULL AND (dp.created_by = ${actor}::uuid OR ${all}))
                OR (dp.client_id IS NOT NULL AND ${clientScope('dp.client_id::text')}))
          ))
        )
      )
    )))`
  ]
  if (projectId) conditions.push(`${o}->>'kind' = 'project' AND ${o}->>'projectId' = ${param(projectId)}::text`)
  if (clientId) conditions.push(`${o}->>'kind' IN ('client','project') AND ${o}->>'clientId' = ${param(clientId)}::text`)
  return { sql: `(${conditions.join(' AND ')})`, params }
}
