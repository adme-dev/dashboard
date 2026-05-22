/**
 * GET /api/office/_internal/zones?officeId=...
 * INTERNAL: called by the OfficeRoom DO to populate its capacity + meeting cache.
 *
 * Secret is read from BOTH event.context.cloudflare.env (CF Pages production)
 * AND process.env (local Nitro dev) — Pages secrets aren't on process.env.
 * Pattern mirrors sync-status.post.ts.
 */
import { queryRows } from '~~/server/utils/db'

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

function getSyncSecret(event: Parameters<typeof defineEventHandler>[0] extends (e: infer E) => unknown ? E : never): string | undefined {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.OFFICE_SYNC_SECRET as string | undefined) ?? process.env.OFFICE_SYNC_SECRET
}

export default defineEventHandler(async (event) => {
  const expected = getSyncSecret(event)
  const provided = getHeader(event, 'x-office-sync-secret')
  if (!expected || !provided || provided !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const officeId = getQuery(event).officeId as string | undefined
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }
  const zones = await queryRows<{
    id: string
    capacity: number
    cf_meeting_id: string | null
    cf_preset_default: string
  }>(
    `SELECT id, capacity, cf_meeting_id, cf_preset_default
     FROM office_zones WHERE office_id = $1`,
    [officeId],
  )
  return { zones }
})
