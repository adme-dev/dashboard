/**
 * Get Global Tags
 * GET /api/agency/tags
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const search = query.search as string | undefined
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0
  const sortBy = (query.sortBy as string) || 'usage_count'
  const sortOrder = (query.sortOrder as string) || 'desc'

  let sql = `
    SELECT
      id,
      name,
      slug,
      color,
      description,
      usage_count,
      created_by,
      created_at,
      updated_at
    FROM global_tags
  `

  const params: any[] = []
  const conditions: string[] = []

  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    conditions.push(`(LOWER(name) LIKE $${params.length} OR LOWER(slug) LIKE $${params.length})`)
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`
  }

  // Validate sort column
  const validSortColumns = ['name', 'usage_count', 'created_at', 'updated_at']
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'usage_count'
  const sortDir = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  sql += ` ORDER BY ${sortColumn} ${sortDir}`
  sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
  params.push(limit, offset)

  const tags = await queryRows(sql, params)

  return tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    color: tag.color,
    description: tag.description,
    usageCount: tag.usage_count,
    createdBy: tag.created_by,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at
  }))
})
