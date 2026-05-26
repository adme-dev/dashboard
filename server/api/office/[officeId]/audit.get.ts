/**
 * GET /api/office/:officeId/audit
 * Admin-only office audit trail.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeAuditEventsTable } from '~~/server/utils/officeAudit'
import { canAdministerOffice } from '~~/server/utils/officeRoom'
import type { OfficeAuditEventRow, OfficeMemberRow } from '~~/app/types/office'

type AuditEventWithActor = OfficeAuditEventRow & {
  actor_name: string | null
  actor_avatar_url: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!canAdministerOffice(user, membership)) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  await ensureOfficeAuditEventsTable()
  const events = await queryRows<AuditEventWithActor>(
    `SELECT oae.*,
            tm.name AS actor_name,
            tm.avatar_url AS actor_avatar_url
     FROM office_audit_events oae
     LEFT JOIN team_members tm ON tm.id = oae.actor_id
     WHERE oae.office_id = $1
     ORDER BY oae.created_at DESC
     LIMIT 100`,
    [officeId]
  )

  return { events }
})
