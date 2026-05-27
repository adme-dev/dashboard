import { requireClientAuth } from '~~/server/utils/clientAuth'
import { execute } from '~~/server/utils/db'

const PORTAL_VISIBLE_EXISTS = `EXISTS (
  SELECT 1 FROM lead_form_rules r
  JOIN lead_rule_destinations d ON d.rule_id = r.id
  WHERE r.source = l.source AND r.form_id = l.form_id
    AND r.client_id = l.client_id
    AND r.enabled = TRUE
    AND d.destination_type = 'portal' AND d.enabled = TRUE
)`

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const n = await execute(
    `UPDATE leads l SET status = 'contacted', contacted_at = NOW()
     WHERE id = $1
       AND client_id = $2
       AND deleted_at IS NULL
       AND status = 'new'
       AND ${PORTAL_VISIBLE_EXISTS}`,
    [id, client.clientId]
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'not_updatable' })
  return { ok: true }
})
