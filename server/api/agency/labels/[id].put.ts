/**
 * Update a task label
 */

import { queryOne } from '~~/server/utils/db'

interface UpdateLabelBody {
  name?: string
  color?: string
  description?: string
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateLabelBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Label ID is required'
    })
  }

  // Build dynamic update
  const fields: string[] = []
  const values: any[] = []
  let idx = 1

  if (body.name !== undefined) {
    fields.push(`name = $${idx}`)
    values.push(body.name.trim())
    idx++
  }

  if (body.color !== undefined) {
    fields.push(`color = $${idx}`)
    values.push(body.color)
    idx++
  }

  if (body.description !== undefined) {
    fields.push(`description = $${idx}`)
    values.push(body.description?.trim() || null)
    idx++
  }

  if (fields.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No fields to update'
    })
  }

  values.push(id)

  try {
    const label = await queryOne(`
      UPDATE task_labels
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, values)

    if (!label) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Label not found'
      })
    }

    return {
      id: label.id,
      departmentId: label.department_id,
      name: label.name,
      color: label.color,
      description: label.description,
      createdAt: label.created_at,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    if (error.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'A label with this name already exists'
      })
    }
    console.error('Failed to update label:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update label'
    })
  }
})
