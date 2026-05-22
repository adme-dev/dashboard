/**
 * GET /api/office
 * Returns the offices the authenticated user is a member of.
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import type { OfficeRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const offices = await queryRows<OfficeRow & { my_role: string }>(
    `SELECT o.*, om.role AS my_role
     FROM offices o
     JOIN office_members om ON om.office_id = o.id
     WHERE om.user_id = $1
     ORDER BY o.name ASC`,
    [user.id]
  )
  return { offices }
})
