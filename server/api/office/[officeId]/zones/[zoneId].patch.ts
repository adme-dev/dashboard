/**
 * PATCH /api/office/:officeId/zones/:zoneId
 * Admin-only: update mutable zone fields. Dynamic SET clause from supplied
 * keys; omitted keys are not touched.
 */

import { z } from 'zod'
import { execute } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

const Body = z.object({
  name: z.string().min(1).max(120).optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number().positive(),
      h: z.number().positive(),
    })
    .optional(),
  capacity: z.number().int().positive().optional(),
  is_private: z.boolean().optional(),
  acl: z
    .object({
      allowed_roles: z.array(z.string()).optional(),
      allowed_clients: z.array(z.string().uuid()).optional(),
      public_lobby: z.boolean().optional(),
    })
    .optional(),
})

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const zoneId = getRouterParam(event, 'zoneId')!
  await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))

  const sets: string[] = []
  const params: unknown[] = []
  let i = 1
  if (body.name !== undefined) {
    sets.push(`name = $${i++}`)
    params.push(body.name)
  }
  if (body.position !== undefined) {
    sets.push(`position = $${i++}`)
    params.push(JSON.stringify(body.position))
  }
  if (body.capacity !== undefined) {
    sets.push(`capacity = $${i++}`)
    params.push(body.capacity)
  }
  if (body.is_private !== undefined) {
    sets.push(`is_private = $${i++}`)
    params.push(body.is_private)
  }
  if (body.acl !== undefined) {
    sets.push(`acl = $${i++}`)
    params.push(JSON.stringify(body.acl))
  }

  if (sets.length === 0) return { updated: 0 }

  params.push(zoneId, officeId)
  await execute(
    `UPDATE office_zones SET ${sets.join(', ')} WHERE id = $${i++} AND office_id = $${i}`,
    params,
  )
  return { updated: 1 }
})
