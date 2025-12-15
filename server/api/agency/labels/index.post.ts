/**
 * Create a new task label
 */

import { queryOne } from '~~/server/utils/db'

interface CreateLabelBody {
  name: string
  color?: string
  description?: string
  departmentId?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateLabelBody>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Label name is required'
    })
  }

  try {
    const label = await queryOne(`
      INSERT INTO task_labels (name, color, description, department_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      body.name.trim(),
      body.color || '#6B7280',
      body.description?.trim() || null,
      body.departmentId || null,
    ])

    return {
      id: label.id,
      departmentId: label.department_id,
      name: label.name,
      color: label.color,
      description: label.description,
      createdAt: label.created_at,
    }
  } catch (error: any) {
    if (error.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'A label with this name already exists'
      })
    }
    console.error('Failed to create label:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create label'
    })
  }
})
