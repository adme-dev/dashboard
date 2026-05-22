/**
 * WebSocket endpoint for Virtual Office presence.
 *
 * URL: /api/ws/office/:officeId
 *
 * Validates the staff session, confirms office membership, then proxies the
 * WS upgrade to the OfficeRoom Durable Object with the actor's identity in
 * the URL params. The DO accepts the upgrade and starts streaming presence.
 *
 * Phase 1a is staff-only. Client portal support lands in Phase 1d.
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { toActorHandle, getOfficeRoom } from '~~/server/utils/officeRoom'
import type { OfficeMemberRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  // 1. Session — staff only in 1a
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  // 2. Membership check
  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members
     WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  // 3. Confirm WS upgrade
  if (event.node.req.headers.upgrade !== 'websocket') {
    throw createError({ statusCode: 426, statusMessage: 'WebSocket upgrade required' })
  }

  // 4. Build identity params and forward to the DO
  const handle = toActorHandle({ id: user.id }, 'user')
  const params = new URLSearchParams({
    handle,
    name: user.name || user.email,
    avatarUrl: user.avatar_url || '',
    role: membership.role,
    isGuest: 'false'
  })

  const stub = getOfficeRoom(event, officeId)
  const upgradeReq = new Request(
    `https://office-room-do/?${params.toString()}`,
    { headers: event.node.req.headers as unknown as HeadersInit }
  )
  return stub.fetch(upgradeReq)
})
