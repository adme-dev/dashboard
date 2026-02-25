import { queryRows } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const query = getQuery(event)

  const type = query.type as string | undefined
  const status = query.status as string | undefined

  const conditions: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (type) {
    conditions.push(`adapter_type = $${paramIndex}`)
    params.push(type)
    paramIndex++
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`)
    params.push(status)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = await queryRows(`
    SELECT id, name, display_name, model_base, version, dataset_id, r2_path,
           cf_finetune_id, status, adapter_type, rank, traffic_pct, metrics,
           error_message, created_by, created_at, updated_at
    FROM ai_lora_adapters
    ${whereClause}
    ORDER BY created_at DESC
  `, params)

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    modelBase: r.model_base,
    version: r.version,
    datasetId: r.dataset_id,
    r2Path: r.r2_path,
    cfFinetuneId: r.cf_finetune_id,
    status: r.status,
    adapterType: r.adapter_type,
    rank: r.rank,
    trafficPct: r.traffic_pct,
    metrics: r.metrics,
    errorMessage: r.error_message,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
})
