import { readMultipartFormData } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { uploadAdapter } from '~~/server/utils/aiLoraManager'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const id = getRouterParam(event, 'id')

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const file = formData.find(f => f.name === 'file')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file field' })
  }

  const filename = file.filename || ''
  if (!filename.endsWith('.safetensors')) {
    throw createError({ statusCode: 400, statusMessage: 'File must be a .safetensors file' })
  }

  await uploadAdapter(id!, Buffer.from(file.data))

  // Return updated adapter
  const row = await queryOne(
    `SELECT id, name, display_name, model_base, version, dataset_id, r2_path,
            cf_finetune_id, status, adapter_type, rank, traffic_pct, metrics,
            error_message, created_by, created_at, updated_at
     FROM ai_lora_adapters WHERE id = $1`,
    [id]
  )

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
