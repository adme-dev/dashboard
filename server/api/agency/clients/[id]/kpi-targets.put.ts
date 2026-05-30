import { transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

interface TargetInput {
  resultType: string
  targetCostPerResult: number
  targetCtr?: number | null
  maxFrequency?: number | null
}

export default defineEventHandler(async (event) => {
  await requireRole(event, [...PERMISSIONS.MANAGEMENT])
  const clientId = getRouterParam(event, 'id')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })

  const body = await readBody(event)
  const targets: TargetInput[] = Array.isArray(body?.targets) ? body.targets : []

  for (const t of targets) {
    if (!t.resultType || typeof t.resultType !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Each target needs a resultType' })
    }
    if (!(Number(t.targetCostPerResult) > 0)) {
      throw createError({ statusCode: 400, statusMessage: `targetCostPerResult must be > 0 for ${t.resultType}` })
    }
  }

  await transaction(async (client) => {
    await client.query(`DELETE FROM client_kpi_targets WHERE client_id = $1`, [clientId])
    for (const t of targets) {
      await client.query(
        `INSERT INTO client_kpi_targets (client_id, result_type, target_cost_per_result, target_ctr, max_frequency)
         VALUES ($1, $2, $3, $4, $5)`,
        [clientId, t.resultType, t.targetCostPerResult,
         t.targetCtr == null ? null : t.targetCtr, t.maxFrequency == null ? null : t.maxFrequency]
      )
    }
  })

  return { ok: true, count: targets.length }
})
