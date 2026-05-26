/**
 * GET /api/office
 * Returns the offices the authenticated user is a member of.
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { canAdministerOffice } from '~~/server/utils/officeRoom'
import type { OfficeRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  let offices = await queryRows<OfficeRow & { my_role: string }>(
    `SELECT o.*, om.role AS my_role
     FROM offices o
     JOIN office_members om ON om.office_id = o.id
     WHERE om.user_id = $1
     ORDER BY o.name ASC`,
    [user.id]
  )

  if (offices.length === 0 && import.meta.dev) {
    const office = await queryOne<OfficeRow>(
      `SELECT * FROM offices ORDER BY created_at ASC LIMIT 1`
    )
    if (office) {
      const role = ['owner', 'admin'].includes(user.role) ? 'admin' : 'member'
      await queryOne<{ id: string }>(
        `INSERT INTO office_members (office_id, user_id, role)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (
           SELECT 1 FROM office_members WHERE office_id = $1 AND user_id = $2
         )
         RETURNING id`,
        [office.id, user.id, role]
      )
      offices = await queryRows<OfficeRow & { my_role: string }>(
        `SELECT o.*, om.role AS my_role
         FROM offices o
         JOIN office_members om ON om.office_id = o.id
         WHERE om.user_id = $1
         ORDER BY o.name ASC`,
        [user.id]
      )
    }
  }

  return {
    offices: offices.map(office => ({
      ...office,
      my_role: canAdministerOffice(user, { role: office.my_role })
        ? 'admin'
        : office.my_role
    }))
  }
})
