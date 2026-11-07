import { createError } from 'h3'
import { z } from 'zod'
import { queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { PERMISSION_GROUPS } from '~~/server/utils/permissions'
import type { RoleSkillAdminWorkflow, RoleSkillBindings, RoleSkillVersion } from '~~/shared/types/roleSkills'
import { ROLE_SKILL_DEFINITIONS, roleSkillDefinition } from './definitions'

export interface RoleSkillTx {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>
}
export interface RoleSkillStore {
  rows: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  transaction: <T>(fn: (db: RoleSkillTx) => Promise<T>) => Promise<T>
}
export const defaultRoleSkillStore: RoleSkillStore = {
  rows: queryRowsFresh,
  transaction: fn => transactionWithoutRetry(db => fn(db))
}
const bindingsSchema = z.strictObject({
  allRoles: z.boolean().default(false),
  roleIds: z.array(z.string().uuid()).max(100),
  systemRoles: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).max(50),
  permissionGroups: z.array(z.enum(PERMISSION_GROUPS)).max(PERMISSION_GROUPS.length)
})
export const draftSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(), label: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500), prompt: z.string().trim().min(1).max(8000),
  enabled: z.boolean(), bindings: bindingsSchema, reason: z.string().trim().min(3).max(1000)
})
export const publishSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(), versionId: z.string().uuid(), reason: z.string().trim().min(3).max(1000)
})
export interface VersionRow {
  id: string
  workflow_key: string
  version: number
  label: string
  description: string
  prompt: string
  enabled: boolean
  bindings: RoleSkillBindings
  created_at: string | Date
  created_by: string | null
  published_at: string | Date | null
  published_by: string | null
  publish_reason: string | null
  audit_reason: string
}
interface WorkflowRow { workflow_key: string, revision: number, active_version_id: string | null }
const versionSelect = (extra = '') => `SELECT v.*${extra}, p.created_at AS published_at,p.actor_id AS published_by,p.reason AS publish_reason
 FROM assistant_role_skill_versions v LEFT JOIN LATERAL (
 SELECT created_at,actor_id,reason FROM assistant_role_skill_publications WHERE version_id=v.id ORDER BY workflow_revision DESC LIMIT 1
 ) p ON TRUE`
const iso = (value: string | Date | null) => value == null ? null : new Date(value).toISOString()
function versionView(row: VersionRow): RoleSkillVersion {
  return { id: row.id, workflowKey: row.workflow_key, version: row.version, label: row.label, description: row.description,
    prompt: row.prompt, enabled: row.enabled, bindings: bindingsSchema.parse(row.bindings), createdAt: iso(row.created_at)!,
    createdBy: row.created_by, publishedAt: iso(row.published_at), publishedBy: row.published_by,
    publishReason: row.publish_reason, auditReason: row.audit_reason }
}
export async function readRoleSkillCatalogue(store = defaultRoleSkillStore): Promise<RoleSkillAdminWorkflow[]> {
  const [workflows, versions] = await Promise.all([
    store.rows<WorkflowRow>('SELECT workflow_key,revision,active_version_id FROM assistant_role_skills ORDER BY workflow_key'),
    store.rows<VersionRow>(`${versionSelect()} ORDER BY v.workflow_key,v.version DESC`)
  ])
  return workflows.flatMap((row) => {
    const definition = roleSkillDefinition(row.workflow_key)
    if (!definition) return []
    const history = versions.filter(version => version.workflow_key === row.workflow_key).map(versionView)
    return [{ key: definition.key, group: definition.group, persona: definition.persona, tools: [...definition.tools],
      sources: [...definition.sources], revision: row.revision, active: history.find(version => version.id === row.active_version_id) ?? null,
      draft: history[0]?.publishedAt === null ? history[0] : null, history }]
  })
}
export async function readActiveRoleSkills(store = defaultRoleSkillStore): Promise<RoleSkillAdminWorkflow[]> {
  // Employee discovery reads only current published snapshots, never drafts or historical prompt text.
  // Missing tables or failed storage never resurrect in-code defaults.
  const rows = await store.rows<VersionRow & { revision: number }>(`${versionSelect(',w.revision')}
    JOIN assistant_role_skills w ON w.workflow_key=v.workflow_key AND w.active_version_id=v.id
    WHERE v.enabled=TRUE AND p.created_at IS NOT NULL ORDER BY v.workflow_key`)
  return rows.flatMap((row) => {
    const definition = roleSkillDefinition(row.workflow_key)
    if (!definition) return []
    return [{ key: definition.key, group: definition.group, persona: definition.persona, tools: [...definition.tools],
      sources: [...definition.sources], revision: row.revision, active: versionView(row), draft: null, history: [] }]
  })
}

function knownKey(key: string) {
  if (!roleSkillDefinition(key)) throw createError({ statusCode: 404, statusMessage: 'Unknown curated workflow' })
}
async function lockWorkflow(db: RoleSkillTx, key: string, revision: number) {
  const row = (await db.query<WorkflowRow>('SELECT workflow_key,revision,active_version_id FROM assistant_role_skills WHERE workflow_key=$1 FOR UPDATE', [key])).rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Workflow is not configured' })
  if (row.revision !== revision) throw createError({ statusCode: 409, statusMessage: 'Workflow changed; reload before saving' })
  return row
}
async function validateRoleBindings(db: RoleSkillTx, bindings: RoleSkillBindings) {
  const roles = (await db.query<{ id: string, slug: string, is_system: boolean }>(
    'SELECT id::text,slug,is_system FROM custom_roles WHERE id=ANY($1::uuid[]) OR (is_system=TRUE AND slug=ANY($2::text[]))',
    [bindings.roleIds, bindings.systemRoles])).rows
  if (bindings.roleIds.some(id => !roles.some(role => role.id === id))
    || bindings.systemRoles.some(slug => !roles.some(role => role.is_system && role.slug === slug))) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown role attachment' })
  }
}
export async function saveRoleSkillDraft(key: string, body: unknown, actorId: string, store = defaultRoleSkillStore) {
  knownKey(key)
  const input = draftSchema.parse(body)
  await store.transaction(async (db) => {
    await lockWorkflow(db, key, input.expectedRevision)
    await validateRoleBindings(db, input.bindings)
    const next = (await db.query<{ version: number }>('SELECT COALESCE(MAX(version),0)+1 AS version FROM assistant_role_skill_versions WHERE workflow_key=$1', [key])).rows[0]!.version
    await db.query(`INSERT INTO assistant_role_skill_versions (workflow_key,version,label,description,prompt,enabled,bindings,created_by,audit_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`, [key, next, input.label, input.description, input.prompt, input.enabled, JSON.stringify(input.bindings), actorId, input.reason])
    await db.query('UPDATE assistant_role_skills SET revision=revision+1 WHERE workflow_key=$1', [key])
  })
  return (await readRoleSkillCatalogue(store)).find(workflow => workflow.key === key)!
}
export async function publishRoleSkillVersion(key: string, body: unknown, actorId: string, store = defaultRoleSkillStore) {
  knownKey(key)
  const input = publishSchema.parse(body)
  await store.transaction(async (db) => {
    await lockWorkflow(db, key, input.expectedRevision)
    const version = (await db.query<{ id: string }>('SELECT id FROM assistant_role_skill_versions WHERE id=$1 AND workflow_key=$2', [input.versionId, key])).rows[0]
    if (!version) throw createError({ statusCode: 404, statusMessage: 'Workflow version not found' })
    await db.query('INSERT INTO assistant_role_skill_publications (workflow_key,version_id,workflow_revision,actor_id,reason) VALUES ($1,$2,$3,$4,$5)',
      [key, version.id, input.expectedRevision + 1, actorId, input.reason])
    await db.query('UPDATE assistant_role_skills SET active_version_id=$2,revision=revision+1 WHERE workflow_key=$1', [key, version.id])
  })
  return (await readRoleSkillCatalogue(store)).find(workflow => workflow.key === key)!
}
export const roleSkillKeys = ROLE_SKILL_DEFINITIONS.map(definition => definition.key)
