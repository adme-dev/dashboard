// server/utils/crm/engine/recordWrite.ts
// Validates record data against an object's field defs and verifies relation targets
// exist within the same client (the existence check validateRecord intentionally defers).
import { queryRows, queryOne } from '~~/server/utils/db'
import { validateRecord, type ValidatorFieldDef } from './validateRecord'
import type { EngineFieldDef } from './types'

export async function loadFieldDefs(objectDefId: string, clientId: string): Promise<EngineFieldDef[]> {
  return queryRows<EngineFieldDef>(
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
export async function assertStageBelongsToClient(stageId: string | null | undefined, clientId: string): Promise<void> {
  if (stageId == null) return
  const hit = await queryOne<{ id: string }>(
    `SELECT id FROM crm_stages WHERE id = $1 AND client_id = $2`,
    [stageId, clientId],
  )
  if (!hit) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
}

export async function validateAndCheckRelations(
  defs: EngineFieldDef[],
  clientId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const validatorDefs: ValidatorFieldDef[] = defs.map(d => ({
    key: d.key, field_type: d.field_type, options: d.options, relation_target: d.relation_target, is_required: d.is_required,
  }))
  const clean = validateRecord(validatorDefs, data) // throws on type/required/format

  // Existence-check each relation value within this client.
  for (const d of defs) {
    if (d.field_type !== 'relation' || !d.relation_target) continue
    const val = clean[d.key]
    if (val == null) continue
    const table = d.relation_target === 'person' ? 'crm_people' : 'crm_companies'
    const hit = await queryOne<{ id: string }>(
      `SELECT id FROM ${table} WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
      [val, clientId],
    )
    if (!hit) throw createError({ statusCode: 400, statusMessage: `Related ${d.relation_target} not found for field "${d.key}"` })
  }
  return clean
}
