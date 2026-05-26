/**
 * DELETE /api/office/:officeId/lobbies/:lobbyId
 * Admin-only: archive a lobby handle by deactivating it.
 */
import { execute } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { ensureOfficeLobbiesTable } from '~~/server/utils/officeLobbies'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  const lobbyId = getRouterParam(event, 'lobbyId')
  if (!officeId || !lobbyId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and lobbyId are required' })
  }

  const { user } = await requireOfficeAdmin(event, officeId)
  await ensureOfficeLobbiesTable()
  await execute(
    `UPDATE office_lobbies
     SET is_active = false
     WHERE id = $1 AND office_id = $2`,
    [lobbyId, officeId]
  )

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'lobby.archived',
    targetType: 'office_lobby',
    targetId: lobbyId,
    metadata: {}
  })

  return { deleted: 1 }
})
