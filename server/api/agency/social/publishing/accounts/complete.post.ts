import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, execute } from '~~/server/utils/db'
import { verifyState } from '~~/server/utils/socialOAuth/state'
import { mapPagesToAccountRows, subscribePageWebhook } from '~~/server/utils/socialOAuth/meta'
import { mapGoogleBusinessLocationsToAccountRows } from '~~/server/utils/socialOAuth/googleBusiness'
import { mapYouTubeChannelsToAccountRows } from '~~/server/utils/socialOAuth/youtube'
import { mapLinkedInOrganizationsToAccountRows } from '~~/server/utils/socialOAuth/linkedin'
import { upsertSocialAccount, markWebhookSubscribed } from '~~/server/utils/socialOAuth/store'
import { getPending, delPending } from '~~/server/utils/socialOAuth/pending'
import { getSocialOauthStateSecret } from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * POST /api/agency/social/publishing/accounts/complete  body { token, pageIds: string[] }
 * Finalizes the operator's page selection from the KV-stashed pending connection.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const { token, pageIds } = await readBody(event)
  if (!token || !Array.isArray(pageIds) || !pageIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'token and pageIds required' })
  }
  const secret = getSocialOauthStateSecret(event)
  const sel = verifyState<{ nonce: string, clientId: string, userId: string }>(String(token), secret, 600_000)
  if (!sel) throw createError({ statusCode: 400, statusMessage: 'invalid or expired selection' })
  // Bind the selection to the operator who started it — a leaked token can't be finalized by someone else.
  if (sel.userId !== String(user.id)) throw createError({ statusCode: 403, statusMessage: 'not your selection' })

  const pending = await getPending(event, sel.nonce)
  if (!pending) throw createError({ statusCode: 410, statusMessage: 'selection expired' })
  await requireSocialClientAccess(event, pending.clientId)
  // Consume the pending entry up front so a captured token can't be replayed (the second attempt 410s).
  await delPending(event, sel.nonce)

  if (pending.platform === 'google-business') {
    const google = pending.googleBusiness
    if (!google) throw createError({ statusCode: 410, statusMessage: 'selection expired' })
    const chosen = google.locations.filter(location => pageIds.includes(location.id))
    if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching locations' })

    const connected: string[] = []
    const conflicts: string[] = []
    const rows = mapGoogleBusinessLocationsToAccountRows(
      chosen,
      google.accessToken,
      google.refreshToken,
      pending.expiresAt
    )
    for (const row of rows) {
      const res = await upsertSocialAccount({ queryOne, execute }, pending.clientId, row, String(user.id))
      if (res.status === 'conflict') {
        conflicts.push(`${row.account_name} -> ${res.conflictClientName || 'another client'}`)
      } else {
        connected.push(row.account_name)
      }
    }
    return { connected, conflicts }
  }

  if (pending.platform === 'youtube') {
    const youtube = pending.youtube
    if (!youtube) throw createError({ statusCode: 410, statusMessage: 'selection expired' })
    const chosen = youtube.channels.filter(channel => pageIds.includes(channel.id))
    if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching channels' })

    const connected: string[] = []
    const conflicts: string[] = []
    const rows = mapYouTubeChannelsToAccountRows(
      chosen,
      youtube.accessToken,
      youtube.refreshToken,
      pending.expiresAt
    )
    for (const row of rows) {
      const res = await upsertSocialAccount({ queryOne, execute }, pending.clientId, row, String(user.id))
      if (res.status === 'conflict') {
        conflicts.push(`${row.account_name} -> ${res.conflictClientName || 'another client'}`)
      } else {
        connected.push(row.account_name)
      }
    }
    return { connected, conflicts }
  }

  if (pending.platform === 'linkedin') {
    const linkedin = pending.linkedin
    if (!linkedin) throw createError({ statusCode: 410, statusMessage: 'selection expired' })
    const chosen = linkedin.organizations.filter(organization => pageIds.includes(organization.id))
    if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching organizations' })

    const connected: string[] = []
    const conflicts: string[] = []
    const rows = mapLinkedInOrganizationsToAccountRows(
      chosen,
      linkedin.accessToken,
      linkedin.refreshToken,
      pending.expiresAt
    )
    for (const row of rows) {
      const res = await upsertSocialAccount({ queryOne, execute }, pending.clientId, row, String(user.id))
      if (res.status === 'conflict') {
        conflicts.push(`${row.account_name} -> ${res.conflictClientName || 'another client'}`)
      } else {
        connected.push(row.account_name)
      }
    }
    return { connected, conflicts }
  }

  const chosen = (pending.pages ?? []).filter(p => pageIds.includes(p.id))
  if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching pages' })

  // Process pages concurrently — each page does a webhook subscribe (Graph call,
  // now timeout-capped) plus its row upserts. Sequential fan-out over several
  // pages was overrunning Cloudflare's request budget → 524.
  const perPage = await Promise.all(chosen.map(async (page) => {
    const rows = mapPagesToAccountRows(page, pending.expiresAt)
    const sub = await subscribePageWebhook(page.id, page.accessToken)
    for (const row of rows) {
      row.metadata.webhook_subscribed = sub.ok
      const res = await upsertSocialAccount({ queryOne, execute }, pending.clientId, row, String(user.id))
      if (res.status === 'conflict') {
        return { conflict: `${page.name} -> ${res.conflictClientName || 'another client'}` }
      }
      if (!sub.ok) await markWebhookSubscribed({ queryOne, execute }, res.id, false, `webhook subscribe failed: ${sub.error}`)
    }
    return { connected: page.name }
  }))

  const connected = perPage.filter(r => r.connected).map(r => r.connected as string)
  const conflicts = perPage.filter(r => r.conflict).map(r => r.conflict as string)
  return { connected, conflicts }
})
