/**
 * The caller's RBAC-available co-pilot tools, for the "My Assistant" disable toggles.
 * GET /api/agency/ai/my-assistant/tools
 *
 * Returns only tools the user's role can already use (filterToolsForUser) — the Personalize tier can
 * NARROW this set (disable), never grant. Read-only metadata (name + description + write flag).
 */
import { requireAuth } from '~~/server/utils/auth'
import { registry } from '~~/server/utils/ai/tools/index'
import { filterToolsForUser } from '~~/server/utils/ai/toolRegistry'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const tools = filterToolsForUser(registry, user.role).map(t => ({
    name: t.name,
    description: t.description,
    mutates: !!t.mutates,
  }))
  return { tools }
})
