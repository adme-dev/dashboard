import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const schema = z.object({
  items: z.array(z.object({
    connectionId: z.string().uuid(),
    propertyId: z.string().min(1),
    propertyDisplayName: z.string().optional().default(''),
    clientId: z.string().uuid()
  })).min(1)
})

/**
 * POST /api/agency/social/ga4/map-bulk
 * Upserts many property→client mappings in one request (used by Auto-map).
 * Each row is an independent ON CONFLICT (property_id) upsert.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  const body = schema.parse(await readBody(event))

  for (const item of body.items) {
    await execute(
      `INSERT INTO ga4_property_map (connection_id, property_id, property_display_name, client_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (property_id)
       DO UPDATE SET connection_id = EXCLUDED.connection_id,
                     property_display_name = EXCLUDED.property_display_name,
                     client_id = EXCLUDED.client_id,
                     updated_at = NOW()`,
      [item.connectionId, item.propertyId, item.propertyDisplayName, item.clientId]
    )
  }

  return { ok: true, mapped: body.items.length }
})
