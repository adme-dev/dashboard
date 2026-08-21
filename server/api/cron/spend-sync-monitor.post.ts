import { createError, getHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { createBulkNotifications } from '~~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  const expected = process.env.CRON_SECRET
  if (!expected || getHeader(event, 'x-cron-secret') !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const rows = await queryRows<{ platform: string, last_synced_at: string | null }>(
    `SELECT expected.platform, MAX(ms.synced_at)::text AS last_synced_at
       FROM (VALUES ('meta'::text), ('google_ads'::text)) expected(platform)
       LEFT JOIN media_spend ms ON ms.platform = expected.platform
      GROUP BY expected.platform`,
    []
  )
  const threshold = Date.now() - 90 * 60_000
  const stale = rows.filter(row => !row.last_synced_at || Date.parse(row.last_synced_at) < threshold)
  if (!stale.length) return { ok: true, alerted: false, providers: rows }

  const owners = await queryRows<{ id: string }>(
    `SELECT id FROM team_members WHERE is_active = TRUE AND user_role = 'owner'`,
    []
  )
  await createBulkNotifications(owners.map(owner => owner.id), {
    type: 'system',
    title: 'Morning ad-spend sync missed its freshness SLO',
    message: `${stale.map(row => row.platform === 'google_ads' ? 'Google' : 'Meta').join(' and ')} spend data did not move within 90 minutes of the 07:45 Melbourne sync slot. Pacing actions must remain halted until a verified sync completes.`,
    link: '/agency/social',
    reason: 'direct',
    metadata: {
      kind: 'spend_sync_slot_missed',
      thresholdMinutes: 90,
      providers: stale,
    },
  })
  return { ok: true, alerted: true, staleProviders: stale }
})

