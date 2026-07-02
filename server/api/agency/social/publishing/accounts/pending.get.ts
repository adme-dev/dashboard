import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryRows } from '~~/server/utils/db'
import { verifyState } from '~~/server/utils/socialOAuth/state'
import { getPending } from '~~/server/utils/socialOAuth/pending'
import { getSocialOauthStateSecret } from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET ...accounts/pending?token=  → the page names for the selection modal (NEVER any token).
 * Cross-references social_accounts so the modal can pre-check/flag pages already connected to this
 * client and disable pages owned by another client.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const secret = getSocialOauthStateSecret(event)
  const sel = verifyState<{ nonce: string, userId: string }>(String(getQuery(event).token || ''), secret, 600_000)
  if (!sel) throw createError({ statusCode: 400, statusMessage: 'invalid token' })
  if (sel.userId !== String(user.id)) throw createError({ statusCode: 403, statusMessage: 'not your selection' })

  const pending = await getPending(event, sel.nonce)
  if (!pending) throw createError({ statusCode: 410, statusMessage: 'expired' })
  await requireSocialClientAccess(event, pending.clientId)

  if (pending.platform === 'google-business') {
    const locations = pending.googleBusiness?.locations ?? []
    const ids = locations.map(location => location.id)
    const locationIds = locations.map(location => location.locationId).filter(Boolean)
    const existing = ids.length || locationIds.length
      ? await queryRows<{ platform_account_id: string, google_business_location_id: string | null, client_id: string }>(
          `SELECT platform_account_id, metadata->>'googleBusinessLocationId' AS google_business_location_id, client_id
             FROM social_accounts
            WHERE platform = 'google-business'
              AND (platform_account_id = ANY($1) OR metadata->>'googleBusinessLocationId' = ANY($2))`,
          [ids, locationIds])
      : []
    const owner = new Map(existing.map(e => [e.platform_account_id, e.client_id]))
    for (const e of existing) {
      if (e.google_business_location_id) owner.set(e.google_business_location_id, e.client_id)
    }

    return locations.map((location) => {
      const ownerId = owner.get(location.id) || owner.get(location.locationId)
      const status = !ownerId ? 'new' : ownerId === pending.clientId ? 'connected' : 'conflict'
      return {
        id: location.id,
        name: location.name,
        subtitle: location.address || location.accountName,
        platform: 'google-business',
        status
      }
    })
  }

  if (pending.platform === 'youtube') {
    const channels = pending.youtube?.channels ?? []
    const ids = channels.map(channel => channel.id)
    const existing = ids.length
      ? await queryRows<{ platform_account_id: string, client_id: string }>(
          `SELECT platform_account_id, client_id FROM social_accounts WHERE platform = 'youtube' AND platform_account_id = ANY($1)`,
          [ids])
      : []
    const owner = new Map(existing.map(e => [e.platform_account_id, e.client_id]))

    return channels.map((channel) => {
      const ownerId = owner.get(channel.id)
      const status = !ownerId ? 'new' : ownerId === pending.clientId ? 'connected' : 'conflict'
      return {
        id: channel.id,
        name: channel.name,
        subtitle: channel.handle || 'YouTube channel',
        platform: 'youtube',
        status
      }
    })
  }

  if (pending.platform === 'linkedin') {
    const organizations = pending.linkedin?.organizations ?? []
    const ids = organizations.map(organization => organization.id)
    const existing = ids.length
      ? await queryRows<{ platform_account_id: string, client_id: string }>(
          `SELECT platform_account_id, client_id FROM social_accounts WHERE platform = 'linkedin' AND platform_account_id = ANY($1)`,
          [ids])
      : []
    const owner = new Map(existing.map(e => [e.platform_account_id, e.client_id]))

    return organizations.map((organization) => {
      const ownerId = owner.get(organization.id)
      const status = !ownerId ? 'new' : ownerId === pending.clientId ? 'connected' : 'conflict'
      return {
        id: organization.id,
        name: organization.name,
        subtitle: organization.vanityName || 'LinkedIn organization',
        platform: 'linkedin',
        status
      }
    })
  }

  // Which of these pages already exist as facebook accounts, and for which client?
  const ids = (pending.pages ?? []).map(p => p.id)
  const existing = ids.length
    ? await queryRows<{ platform_account_id: string, client_id: string }>(
        `SELECT platform_account_id, client_id FROM social_accounts WHERE platform = 'facebook' AND platform_account_id = ANY($1)`,
        [ids])
    : []
  const owner = new Map(existing.map(e => [e.platform_account_id, e.client_id]))

  return (pending.pages ?? []).map((p) => {
    const ownerId = owner.get(p.id)
    const status = !ownerId ? 'new' : ownerId === pending.clientId ? 'connected' : 'conflict'
    return { id: p.id, name: p.name, subtitle: p.igUsername ? `+ Instagram @${p.igUsername}` : null, igUsername: p.igUsername, platform: 'meta', status }
  })
})
