/**
 * Create a new board
 * POST /api/agency/boards
 *
 * Boards are backed by the `departments` table. Body:
 * - name: Board name (required)
 * - description?: string
 * - workspaceId?: UUID of the workspace the board belongs to
 * - color?, icon?
 *
 * To seed columns/groups/views from a template, call
 * POST /api/agency/boards/templates/:templateId/apply with the returned id.
 */

import { queryOne } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { workspaceCache } from '~~/server/utils/cache'

interface CreateBoardBody {
  name?: string
  description?: string
  workspaceId?: string | null
  color?: string
  icon?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board'
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = await readBody<CreateBoardBody>(event)

  const name = body?.name?.trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Board name is required' })
  }

  let workspaceId: string | null = null
  if (body.workspaceId) {
    if (!UUID_RE.test(body.workspaceId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid workspace ID' })
    }
    const workspace = await queryOne('SELECT id FROM workspaces WHERE id = $1::uuid', [body.workspaceId])
    if (!workspace) {
      throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
    }
    workspaceId = workspace.id
  }

  // Find a free slug: name, name-2, name-3, ...
  const base = slugify(name)
  let slug = base
  for (let i = 2; i < 100; i++) {
    const taken = await queryOne('SELECT id FROM departments WHERE slug = $1', [slug])
    if (!taken) break
    slug = `${base}-${i}`
  }

  const board = await queryOne(`
    INSERT INTO departments (name, slug, description, color, icon, workspace_id, manager_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, name, slug, description, color, icon, workspace_id, is_active, created_at
  `, [
    name,
    slug,
    body.description?.trim() || null,
    body.color || '#6B7280',
    body.icon || 'layout-grid',
    workspaceId,
    user.id
  ])

  // The sidebar/workspace list is memoised for 5 minutes; make the new board visible immediately.
  workspaceCache.delete('workspaces:list')

  return {
    id: board.id,
    name: board.name,
    slug: board.slug,
    description: board.description,
    color: board.color,
    icon: board.icon,
    workspaceId: board.workspace_id,
    isActive: board.is_active,
    createdAt: board.created_at
  }
})
