import { queryRows, queryCount } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const query = getQuery(event)

  const type = query.type as string | undefined
  const status = query.status as string | undefined
  const page = Math.max(parseInt(query.page as string) || 1, 1)
  const limit = Math.min(parseInt(query.limit as string) || 20, 100)
  const offset = (page - 1) * limit

  const conditions: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (type) {
    conditions.push(`dataset_type = $${paramIndex}`)
    params.push(type)
    paramIndex++
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`)
    params.push(status)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const [items, total] = await Promise.all([
    queryRows(`
      SELECT id, dataset_type, version, status, format, row_count, filtered_count,
             file_size_bytes, r2_path, extraction_options, quality_metrics,
             error_message, created_by, created_at, updated_at
      FROM ai_training_datasets
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]),
    queryCount(`
      SELECT COUNT(*) as count FROM ai_training_datasets ${whereClause}
    `, params),
  ])

  return {
    items: items.map(r => ({
      id: r.id,
      datasetType: r.dataset_type,
      version: r.version,
      status: r.status,
      format: r.format,
      rowCount: r.row_count,
      filteredCount: r.filtered_count,
      fileSizeBytes: r.file_size_bytes,
      r2Path: r.r2_path,
      extractionOptions: r.extraction_options,
      qualityMetrics: r.quality_metrics,
      errorMessage: r.error_message,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total,
    page,
  }
})
