// server/utils/crm/engine/recordWrite.ts
// Validates record data against an object's field defs and verifies relation targets
// exist within the same client (the existence check validateRecord intentionally defers).
import { queryRows, queryOne } from '~~/server/utils/db'
import { validateRecord, type ValidatorFieldDef } from './validateRecord'
import type { EngineFieldDef } from './types'
import {
  requireAllCrmRecordsAccess,
  type AuthoritativeCrmRecord,
  type CrmRecordRef,
  type TransactionClient
} from '~~/server/utils/crm/recordAccess'
import type { CrmRecordAccessContext } from '~~/server/utils/crm/searchContext'

type RecordWriteDatabase = TransactionClient

async function databaseRows<T>(database: RecordWriteDatabase | undefined, sql: string, params: unknown[]) {
  if (!database) return await queryRows<T>(sql, params)
  const result = await database.query(sql, params)
  return (result.rows ?? []) as T[]
}

async function databaseOne<T>(database: RecordWriteDatabase | undefined, sql: string, params: unknown[]) {
  if (!database) return await queryOne<T>(sql, params)
  const result = await database.query(sql, params)
  return (result.rows?.[0] ?? null) as T | null
}

export async function loadFieldDefs(
  objectDefId: string,
  clientId: string,
  database?: RecordWriteDatabase
): Promise<EngineFieldDef[]> {
  return databaseRows<EngineFieldDef>(database,
    `SELECT * FROM crm_field_defs WHERE object_def_id = $1 AND client_id = $2 ORDER BY position`,
    [objectDefId, clientId],
  )
}

export function titleKeys(defs: EngineFieldDef[]): string[] {
  const titles = defs.filter(d => d.is_title).map(d => d.key)
  return titles.length ? titles : defs.slice(0, 1).map(d => d.key) // fall back to first field
}

// Verify a stage_id (if provided) belongs to this client. Config-object stages are always
// per-client (seeded with object-key-prefixed codes), so a global/foreign stage is invalid.
// No-op when stageId is null/undefined. Throws 400 otherwise.
export async function assertStageBelongsToClient(
  stageId: string | null | undefined,
  clientId: string,
  database?: RecordWriteDatabase
): Promise<void> {
  if (stageId == null) return
  const hit = await databaseOne<{ id: string }>(database,
    `SELECT id FROM crm_stages WHERE id = $1 AND client_id = $2`,
    [stageId, clientId],
  )
  if (!hit) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
}

function relationRefs(defs: EngineFieldDef[], data: Record<string, unknown>): CrmRecordRef[] {
  const refs: CrmRecordRef[] = []
  for (const def of defs) {
    if (def.field_type !== 'relation') continue
    if (def.relation_target !== 'person' && def.relation_target !== 'company') {
      throw new Error(`Relation field "${def.key}" has no protected target`)
    }
    const value = data[def.key]
    if (typeof value === 'string' && value) refs.push({ type: def.relation_target, id: value })
  }
  return refs
}

export async function authorizeRecordRelations(
  context: CrmRecordAccessContext,
  defs: EngineFieldDef[],
  data: Record<string, unknown>,
  database?: RecordWriteDatabase,
  deps: { authorizeAll: typeof requireAllCrmRecordsAccess } = { authorizeAll: requireAllCrmRecordsAccess }
) {
  const refs = relationRefs(defs, data)
  const records = await deps.authorizeAll(context, refs, database)
  if (records.length !== refs.length) {
    throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  }
  return records as readonly AuthoritativeCrmRecord[]
}

export async function validateAndCheckRelations(
  defs: EngineFieldDef[],
  clientId: string,
  data: Record<string, unknown>,
  context?: CrmRecordAccessContext,
  database?: RecordWriteDatabase
): Promise<Record<string, unknown>> {
  const validatorDefs: ValidatorFieldDef[] = defs.map(d => ({
    key: d.key, field_type: d.field_type, options: d.options, relation_target: d.relation_target, is_required: d.is_required,
  }))
  const clean = validateRecord(validatorDefs, data) // throws on type/required/format

  if (context) {
    await authorizeRecordRelations(context, defs, clean, database)
    return clean
  }

  // Existence-check each relation value within this client.
  for (const d of defs) {
    if (d.field_type !== 'relation' || !d.relation_target) continue
    const val = clean[d.key]
    if (val == null) continue
    const table = d.relation_target === 'person' ? 'crm_people' : 'crm_companies'
    const hit = await databaseOne<{ id: string }>(database,
      `SELECT id FROM ${table} WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
      [val, clientId],
    )
    if (!hit) throw createError({ statusCode: 400, statusMessage: `Related ${d.relation_target} not found for field "${d.key}"` })
  }
  return clean
}
