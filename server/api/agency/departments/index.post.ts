/**
 * Create a new department
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateDepartmentBody {
  name: string
  slug?: string
  description?: string
  color?: string
  icon?: string
  managerId?: string
}

function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === code
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody<CreateDepartmentBody>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Department name is required'
    })
  }

  // Generate slug if not provided
  const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  try {
    const department = await queryOne(`
      INSERT INTO departments (name, slug, description, color, icon, manager_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      body.name.trim(),
      slug,
      body.description?.trim() || null,
      body.color || '#6B7280',
      body.icon || 'folder',
      body.managerId || null
    ])

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
      updatedAt: department.updated_at
    }
  } catch (error: unknown) {
    if (hasDatabaseErrorCode(error, '23505')) { // Unique violation
      throw createError({
        statusCode: 409,
        statusMessage: 'A department with this slug already exists'
      })
    }
    console.error('Failed to create department:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create department'
    })
  }
})
