import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

const schema = z.object({
  connectionId: z.string().uuid(),
  propertyId: z.string().min(1),
  propertyDisplayName: z.string().optional().default(''),
  clientId: z.string().uuid()
})

/**
 * POST /api/agency/social/ga4/map
 * Maps a GA4 property to a client (one property → one client; re-mapping a
 * property updates the existing row).
 */
export default eventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const body = schema.parse(await readBody(event))

  await execute(
    `INSERT INTO ga4_property_map (connection_id, property_id, property_display_name, client_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (property_id)
     DO UPDATE SET connection_id = EXCLUDED.connection_id,
                   property_display_name = EXCLUDED.property_display_name,
                   client_id = EXCLUDED.client_id,
                   updated_at = NOW()`,
    [body.connectionId, body.propertyId, body.propertyDisplayName, body.clientId]
  )

  return { ok: true }
})
