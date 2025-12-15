/**
 * Update a department
 */

import { queryOne } from '~~/server/utils/db'

interface UpdateDepartmentBody {
  name?: string
  slug?: string
  description?: string
  color?: string
  icon?: string
  managerId?: string | null
  isActive?: boolean
  sortOrder?: number
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateDepartmentBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Department ID is required'
    })
  }

  // Build dynamic update query
  const fields: string[] = []
  const values: any[] = []
  let idx = 1

  if (body.name !== undefined) {
    fields.push(`name = $${idx}`)
    values.push(body.name.trim())
    idx++
  }

  if (body.slug !== undefined) {
    fields.push(`slug = $${idx}`)
    values.push(body.slug)
    idx++
  }

  if (body.description !== undefined) {
    fields.push(`description = $${idx}`)
    values.push(body.description?.trim() || null)
    idx++
  }

  if (body.color !== undefined) {
    fields.push(`color = $${idx}`)
    values.push(body.color)
    idx++
  }

  if (body.icon !== undefined) {
    fields.push(`icon = $${idx}`)
    values.push(body.icon)
    idx++
  }

  if (body.managerId !== undefined) {
    fields.push(`manager_id = $${idx}`)
    values.push(body.managerId || null)
    idx++
  }

  if (body.isActive !== undefined) {
    fields.push(`is_active = $${idx}`)
    values.push(body.isActive)
    idx++
  }

  if (body.sortOrder !== undefined) {
    fields.push(`sort_order = $${idx}`)
    values.push(body.sortOrder)
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
    const department = await queryOne(`
      UPDATE departments
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `, values)

    if (!department) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Department not found'
      })
    }

    return {
      id: department.id,
      name: department.name,
      slug: department.slug,
      description: department.description,
      color: department.color,
      icon: department.icon,
      managerId: department.manager_id,
      isActive: department.is_active,
      sortOrder: department.sort_order,
      createdAt: department.created_at,
      updatedAt: department.updated_at,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    if (error.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'A department with this slug already exists'
      })
    }
    console.error('Failed to update department:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update department'
    })
  }
})
