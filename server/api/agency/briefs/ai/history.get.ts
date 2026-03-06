/**
 * Get historical field values for a given client + template + field combination
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string
  const templateId = query.templateId as string
  const fieldKey = query.fieldKey as string

  if (!templateId || !fieldKey) {
    throw createError({ statusCode: 400, statusMessage: 'templateId and fieldKey are required' })
  }

  try {
    const conditions = ['btf.template_id = $1', 'btf.field_key = $2']
    const params: any[] = [templateId, fieldKey]
    let paramIdx = 3

    if (clientId) {
      conditions.push(`b.client_id = $${paramIdx}`)
      params.push(clientId)
      paramIdx++
    }

    const rows = await queryRows(`
      SELECT bfv.value, COUNT(*) AS usage_count
      FROM brief_field_values bfv
      JOIN briefs b ON bfv.brief_id = b.id
      JOIN brief_template_fields btf ON bfv.field_id = btf.id
      WHERE ${conditions.join(' AND ')}
        AND bfv.value IS NOT NULL
        AND bfv.value != 'null'
        AND bfv.value != '""'
      GROUP BY bfv.value
      ORDER BY usage_count DESC
      LIMIT 10
    `, params)

    // Parse JSON values
    const values = rows.map(r => {
      let parsed = r.value
      try { parsed = JSON.parse(r.value) } catch { /* keep as-is */ }
      return { value: parsed, usageCount: Number(r.usage_count) }
    })

    return { values }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch field history:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch field history' })
  }
})
