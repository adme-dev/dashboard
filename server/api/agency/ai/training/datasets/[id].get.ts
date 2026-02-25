import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const id = getRouterParam(event, 'id')

  const row = await queryOne(`
    SELECT id, dataset_type, version, status, format, row_count, filtered_count,
           file_size_bytes, r2_path, extraction_options, quality_metrics,
           error_message, created_by, created_at, updated_at
    FROM ai_training_datasets
    WHERE id = $1
  `, [id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Dataset not found' })
  }

  return {
    id: row.id,
    datasetType: row.dataset_type,
    version: row.version,
    status: row.status,
    format: row.format,
    rowCount: row.row_count,
    filteredCount: row.filtered_count,
    fileSizeBytes: row.file_size_bytes,
    r2Path: row.r2_path,
    extractionOptions: row.extraction_options,
    qualityMetrics: row.quality_metrics,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
})
