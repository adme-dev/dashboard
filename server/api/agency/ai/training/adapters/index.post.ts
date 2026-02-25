import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

const VALID_ADAPTER_TYPES = ['chat', 'intent', 'rag']

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const body = await readBody(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  if (!VALID_ADAPTER_TYPES.includes(body.adapterType)) {
    throw createError({ statusCode: 400, statusMessage: `adapterType must be one of: ${VALID_ADAPTER_TYPES.join(', ')}` })
  }

  // Auto-increment version based on adapters with same name prefix
  const versionRow = await queryOne<{ max_version: number }>(
    `SELECT COALESCE(MAX(version), 0) as max_version FROM ai_lora_adapters WHERE name LIKE $1`,
    [`${body.name.trim()}%`]
  )
  const nextVersion = (versionRow?.max_version || 0) + 1

  const row = await queryOne(`
    INSERT INTO ai_lora_adapters (name, display_name, adapter_type, rank, dataset_id, model_base, version, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    body.name.trim(),
    body.displayName?.trim() || null,
    body.adapterType,
    body.rank || 16,
    body.datasetId || null,
    body.modelBase || '@cf/meta/llama-3.1-8b-instruct',
    nextVersion,
    user.id,
  ])

  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create adapter' })
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
