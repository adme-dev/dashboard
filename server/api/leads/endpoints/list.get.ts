// server/api/leads/endpoints/list.get.ts
// One row per client. Auto-creates on first read so the UI is always populated.

import { requireRole } from '~~/server/utils/auth'
import { execute, queryRows } from '~~/server/utils/db'

// Admin-only: the response includes the secret_key plaintext (used by the agency
// to paste into Google Ads). Lower-privileged roles get 403.
export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  // Backfill: ensure every active client has a 'google' endpoint row
  await execute(`
    INSERT INTO lead_webhook_endpoints (client_id, source, url_token, secret_key)
    SELECT c.id, 'google', encode(gen_random_bytes(18), 'hex'), encode(gen_random_bytes(24), 'hex')
    FROM agency_clients c
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_webhook_endpoints e
      WHERE e.client_id = c.id AND e.source = 'google'
    )
  `)
  const rows = await queryRows(`
    SELECT e.id, e.client_id, c.name AS client_name,
           e.url_token, e.secret_key, e.secret_key_grace_until, e.rotated_at,
           (SELECT COUNT(*) FROM leads l
            WHERE l.source = 'google' AND l.client_id = e.client_id AND l.deleted_at IS NULL) AS lead_count,
           (SELECT COUNT(*) FROM leads l
            WHERE l.source = 'google' AND l.client_id = e.client_id AND l.deleted_at IS NULL) AS google_lead_count,
           (SELECT COUNT(*) FROM leads l
            WHERE l.source IN ('google', 'meta', 'webhook', 'csv')
              AND l.client_id = e.client_id
              AND l.deleted_at IS NULL) AS routable_lead_count
    FROM lead_webhook_endpoints e
    JOIN agency_clients c ON c.id = e.client_id
    WHERE e.source = 'google'
    ORDER BY c.name ASC
  `)
  return { items: rows }
})
