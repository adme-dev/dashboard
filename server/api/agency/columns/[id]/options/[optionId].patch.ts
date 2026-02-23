/**
 * Update Dropdown Option
 * PATCH /api/agency/columns/:id/options/:optionId
 *
 * Updates label, color, sort order, or default status of a dropdown option.
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const optionId = getRouterParam(event, 'optionId')
  const body = await readBody(event)

  if (!optionId) {
    throw createError({ statusCode: 400, statusMessage: 'Option ID required' })
  }

  try {
    const sets: string[] = []
    const params: any[] = []
    let idx = 1

    if (body.label !== undefined) {
      sets.push(`label = $${idx++}`)
      params.push(body.label.trim())
    }
    if (body.color !== undefined) {
      sets.push(`color = $${idx++}`)
      params.push(body.color)
    }
    if (body.sortOrder !== undefined) {
      sets.push(`sort_order = $${idx++}`)
      params.push(body.sortOrder)
    }
    if (body.isDefault !== undefined) {
      sets.push(`is_default = $${idx++}`)
      params.push(body.isDefault)
    }

    if (sets.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    params.push(optionId)

    const option = await queryOne(`
      UPDATE column_dropdown_options
      SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING
        id,
        column_id as "columnId",
        value,
        label,
        color,
        sort_order as "sortOrder",
        is_default as "isDefault",
        created_at as "createdAt"
    `, params)

    if (!option) {
      throw createError({ statusCode: 404, statusMessage: 'Option not found' })
    }

    return { option }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update option:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update option: ${error.message}`,
    })
  }
})
