/**
 * POST /api/office/_internal/meeting
 * INTERNAL: called by OfficeRoom DO to persist a cf_meeting_id after lazy creation.
 * Body: { zoneId: string, meetingId: string }
 *
 * The WHERE cf_meeting_id IS NULL guard ensures concurrent creates don't clobber
 * each other; first writer wins, others silently no-op.
 *
 * Secret is read from BOTH event.context.cloudflare.env (CF Pages production)
 * AND process.env (local Nitro dev) — Pages secrets aren't on process.env.
 * Pattern mirrors sync-status.post.ts.
 */
import { execute } from '~~/server/utils/db'

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
  const { zoneId, meetingId } = await readBody(event) as { zoneId?: string, meetingId?: string }
  if (!zoneId || !meetingId) {
    throw createError({ statusCode: 400, statusMessage: 'zoneId and meetingId required' })
  }
  await execute(
    `UPDATE office_zones SET cf_meeting_id = $1 WHERE id = $2 AND cf_meeting_id IS NULL`,
    [meetingId, zoneId],
  )
  return { ok: true }
})
