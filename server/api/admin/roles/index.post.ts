import { queryOne, execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner'])

  const body = await readBody<{
    name: string
    description?: string
    color?: string
    icon?: string
    permissionGroups?: string[]
    isReadOnly?: boolean
  }>(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Role name is required' })
  }

  // Generate slug from name
  const slug = body.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')

  // Check for duplicate slug
  const existing = await queryOne('SELECT id FROM custom_roles WHERE slug = $1', [slug])
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'A role with this name already exists' })
  }

  // Insert role
  const role = await queryOne<{ id: string }>(
    `INSERT INTO custom_roles (name, slug, description, color, icon, is_system, is_read_only, sort_order)
     VALUES ($1, $2, $3, $4, $5, false, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM custom_roles))
     RETURNING id`,
    [
      body.name.trim(),
      slug,
      body.description?.trim() || null,
      body.color || '#6366f1',
      body.icon || 'i-lucide-user',
      body.isReadOnly || false,
    ]
  )

  if (!role) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create role' })
  }

  // Insert permission groups
  if (body.permissionGroups?.length) {
    for (const group of body.permissionGroups) {
      await execute(
        'INSERT INTO role_permission_groups (role_id, permission_group) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [role.id, group]
      )
    }
  }

  return { id: role.id, slug, name: body.name.trim() }
})
