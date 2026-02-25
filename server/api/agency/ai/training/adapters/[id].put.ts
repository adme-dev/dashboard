import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  // Validate trafficPct if provided
  if (body.trafficPct !== undefined) {
    const pct = Number(body.trafficPct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      throw createError({ statusCode: 400, statusMessage: 'trafficPct must be between 0 and 100' })
    }
  }

  // If activating, ensure cf_finetune_id exists
  if (body.status === 'active') {
    const existing = await queryOne<{ cf_finetune_id: string | null }>(
      `SELECT cf_finetune_id FROM ai_lora_adapters WHERE id = $1`,
      [id]
    )
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Adapter not found' })
    }
    if (!existing.cf_finetune_id) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot activate adapter without a Cloudflare finetune ID. Upload the adapter first.' })
    }
  }

  const sets: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (body.trafficPct !== undefined) {
    sets.push(`traffic_pct = $${paramIndex}`)
    params.push(Number(body.trafficPct))
    paramIndex++
  }

  if (body.status) {
    sets.push(`status = $${paramIndex}`)
    params.push(body.status)
    paramIndex++
  }

  if (body.displayName !== undefined) {
    sets.push(`display_name = $${paramIndex}`)
    params.push(body.displayName?.trim() || null)
    paramIndex++
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  sets.push('updated_at = NOW()')

  const row = await queryOne(`
    UPDATE ai_lora_adapters
    SET ${sets.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `, [...params, id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Adapter not found' })
  }

  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    modelBase: row.model_base,
    version: row.version,
    datasetId: row.dataset_id,
    r2Path: row.r2_path,
    cfFinetuneId: row.cf_finetune_id,
    status: row.status,
    adapterType: row.adapter_type,
    rank: row.rank,
    trafficPct: row.traffic_pct,
    metrics: row.metrics,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
})
