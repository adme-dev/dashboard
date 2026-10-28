import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import type { LedgerDb } from '~~/server/utils/ai/marketing/departmentExecutionLedger'

const target = z.strictObject({
  resultType: z.string().trim().min(1).max(40),
  targetCostPerResult: z.number().finite().positive().max(99999999.99).multipleOf(0.01),
  targetCtr: z.number().finite().min(0).max(100).multipleOf(0.01).nullable().optional(),
  maxFrequency: z.number().finite().min(0).max(999.99).multipleOf(0.01).nullable().optional()
})
export const clientKpiTargetsSchema = z.array(target).max(100).refine(values => new Set(values.map(row => row.resultType)).size === values.length, 'Duplicate result types')
export type ClientKpiTargetInput = z.infer<typeof target>

/** Revision includes only the exact persisted target values, with deterministic order and nulls. */
export async function readClientKpiTargets(db: LedgerDb, clientId: string, activeOnly = true) {
  const client = await db.query('SELECT id FROM agency_clients WHERE id=$1 AND ($2::boolean=FALSE OR is_active=TRUE)', [clientId, activeOnly])
  if (!client.rows.length) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  const rows = (await db.query(`SELECT k.result_type,k.target_cost_per_result,k.target_ctr,k.max_frequency
    FROM client_kpi_targets k JOIN agency_clients c ON c.id=k.client_id
    WHERE k.client_id=$1 AND ($2::boolean=FALSE OR c.is_active=TRUE) ORDER BY k.result_type LIMIT 101`, [clientId, activeOnly])).rows
  if (rows.length > 100) throw createError({ statusCode: 409, statusMessage: 'KPI configuration exceeds supported bounds' })
  const targets = rows.map(row => ({
    resultType: String(row.result_type), targetCostPerResult: Number(row.target_cost_per_result),
    targetCtr: row.target_ctr == null ? null : Number(row.target_ctr),
    maxFrequency: row.max_frequency == null ? null : Number(row.max_frequency)
  })).sort((a, b) => a.resultType < b.resultType ? -1 : a.resultType > b.resultType ? 1 : 0)
  const available = (await db.query(`SELECT DISTINCT m.result_type FROM media_spend m JOIN agency_clients c ON c.id=m.client_id
    WHERE m.client_id=$1 AND ($2::boolean=FALSE OR c.is_active=TRUE) AND m.result_type IS NOT NULL AND m.result_type<>'' ORDER BY m.result_type LIMIT 101`, [clientId, activeOnly])).rows
  return { targets, availableResultTypesComplete: available.length <= 100, availableResultTypes: available.slice(0, 100).map(row => String(row.result_type)), revision: createHash('sha256').update(JSON.stringify(targets)).digest('hex') }
}

/** Caller owns the transaction. A client lock serializes replacement across browser and MCP. */
export async function replaceClientKpiTargets(db: LedgerDb, clientId: string, raw: unknown, expectedRevision?: string, activeOnly = true) {
  const parsed = clientKpiTargetsSchema.safeParse(raw)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid KPI targets' })
  const locked = await db.query('SELECT id FROM agency_clients WHERE id=$1 AND ($2::boolean=FALSE OR is_active=TRUE) FOR UPDATE', [clientId, activeOnly])
  if (!locked.rows.length) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  const before = await readClientKpiTargets(db, clientId, activeOnly)
  if (expectedRevision !== undefined && expectedRevision !== before.revision) throw createError({ statusCode: 409, statusMessage: 'KPI targets changed; reload before saving' })
  await db.query('DELETE FROM client_kpi_targets WHERE client_id=$1', [clientId])
  for (const row of parsed.data) {
    await db.query(`INSERT INTO client_kpi_targets (client_id,result_type,target_cost_per_result,target_ctr,max_frequency) VALUES ($1,$2,$3,$4,$5)`,
      [clientId, row.resultType, row.targetCostPerResult, row.targetCtr ?? null, row.maxFrequency ?? null])
  }
  return readClientKpiTargets(db, clientId, activeOnly)
}
