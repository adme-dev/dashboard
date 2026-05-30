import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getRouterParam(event, 'id')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })

  const rows = await queryRows<{
    result_type: string; target_cost_per_result: string; target_ctr: string | null; max_frequency: string | null
  }>(
    `SELECT result_type, target_cost_per_result, target_ctr, max_frequency
       FROM client_kpi_targets WHERE client_id = $1 ORDER BY result_type`,
    [clientId]
  )
  // The exact result_type strings this client's campaigns actually carry (set by sync),
  // so the settings UI offers matchable values instead of free-typed guesses.
  const available = await queryRows<{ result_type: string }>(
    `SELECT DISTINCT result_type FROM media_spend
       WHERE client_id = $1 AND result_type IS NOT NULL AND result_type <> ''
       ORDER BY result_type`,
    [clientId]
  )

  return {
    targets: rows.map(r => ({
      resultType: r.result_type,
      targetCostPerResult: Number(r.target_cost_per_result),
      targetCtr: r.target_ctr == null ? null : Number(r.target_ctr),
      maxFrequency: r.max_frequency == null ? null : Number(r.max_frequency),
    })),
    availableResultTypes: available.map(a => a.result_type),
  }
})
