import { randomBytes } from 'node:crypto'
import { requireRole } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const id = getRouterParam(event, 'id')!
  const newKey = randomBytes(24).toString('hex')
  await execute(
    `UPDATE lead_webhook_endpoints
     SET secret_key_previous = secret_key,
         secret_key = $2,
         secret_key_grace_until = NOW() + INTERVAL '30 minutes',
         rotated_at = NOW()
     WHERE id = $1`,
    [id, newKey],
  )
  return { ok: true, secret_key: newKey, grace_minutes: 30 }
})
