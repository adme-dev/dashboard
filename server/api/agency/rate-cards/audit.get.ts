import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const { itemId, page, limit } = getQuery(event)

  const pageNum = Math.max(1, Number(page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 25))
  const offset = (pageNum - 1) * pageSize

  const params: any[] = [pageSize, offset]
  let whereClause = ''

  if (itemId && typeof itemId === 'string') {
    params.push(itemId)
    whereClause = `WHERE a.item_id = $${params.length}`
  }

  const [rows, total] = await Promise.all([
    queryRows(`
      SELECT a.id, a.item_id, a.action, a.field_name, a.old_value, a.new_value,
             a.changed_at, tm.name AS changed_by_name,
             i.service_name AS item_name
      FROM rate_card_audit_log a
      LEFT JOIN team_members tm ON tm.id = a.changed_by
      LEFT JOIN rate_card_items i ON i.id = a.item_id
      ${whereClause}
      ORDER BY a.changed_at DESC
      LIMIT $1 OFFSET $2
    `, params),
    queryCount(`
      SELECT COUNT(*) AS count FROM rate_card_audit_log a ${whereClause}
    `, itemId ? [itemId] : []),
  ])

  return {
    entries: rows.map(r => ({
      id: r.id,
      itemId: r.item_id,
      itemName: r.item_name,
      action: r.action,
      fieldName: r.field_name,
      oldValue: r.old_value,
      newValue: r.new_value,
      changedAt: r.changed_at,
      changedByName: r.changed_by_name,
    })),
    total,
    page: pageNum,
    pageSize,
  }
})
