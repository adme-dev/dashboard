/**
 * POST /api/office/_internal/sync-location
 *
 * INTERNAL: called by the OfficeRoom DO with OFFICE_SYNC_SECRET. Persists the
 * actor's current office zone so server-side assistant watches can evaluate
 * room occupancy and co-presence without depending on in-memory DO state.
 */
import { z } from 'zod'
import { execute } from '~~/server/utils/db'
import { ensureOfficePresenceLocationsTable } from '~~/server/utils/officePresenceLocations'

const Body = z.object({
  office_id: z.string().uuid(),
  actor_type: z.enum(['user', 'client']),
  actor_id: z.string().uuid(),
  zone_id: z.string().uuid().nullable(),
  presence: z.enum(['online', 'offline']).default('online')
})

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

function getSecret(event: Parameters<typeof defineEventHandler>[0] extends (e: infer E) => unknown ? E : never): string | undefined {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.OFFICE_SYNC_SECRET as string | undefined) ?? process.env.OFFICE_SYNC_SECRET
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-office-sync-secret')
  const expected = getSecret(event)
  if (!expected || !secret || !timingSafeEqual(secret, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }

  await ensureOfficePresenceLocationsTable()
  const body = Body.parse(await readBody(event))
  const handle = `${body.actor_type}:${body.actor_id}`

  await execute(
    `INSERT INTO office_presence_locations (
       office_id, actor_type, actor_id, handle, zone_id, presence, last_seen_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())
     ON CONFLICT (office_id, actor_type, actor_id) DO UPDATE
       SET handle = EXCLUDED.handle,
           zone_id = EXCLUDED.zone_id,
           presence = EXCLUDED.presence,
           last_seen_at = now(),
           updated_at = now()`,
    [
      body.office_id,
      body.actor_type,
      body.actor_id,
      handle,
      body.zone_id,
      body.presence
    ]
  )

  return { ok: true }
})
