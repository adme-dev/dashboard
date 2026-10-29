import { requireAuth } from '~~/server/utils/auth'
import { queryRowsFresh } from '~~/server/utils/db'
import { resolveEmailClientScope } from '~~/server/utils/email-marketing/access'

// Minimal uncached choices, scoped before reading client names.
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const scope = await resolveEmailClientScope(event, user)
  const clients = await queryRowsFresh<{ id: string, name: string }>(
    `SELECT id, name FROM agency_clients WHERE is_active = TRUE${scope === 'all' ? '' : ' AND id = ANY($1::uuid[])'} ORDER BY name, id`,
    scope === 'all' ? [] : [scope]
  )
  return { clients, canUseSharedTemplates: scope === 'all' }
})
