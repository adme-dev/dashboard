import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { verifyState } from '~~/server/utils/socialOAuth/state'
import { mapPagesToAccountRows, subscribePageWebhook } from '~~/server/utils/socialOAuth/meta'
import { mapGoogleBusinessLocationsToAccountRows } from '~~/server/utils/socialOAuth/googleBusiness'
import { mapYouTubeChannelsToAccountRows } from '~~/server/utils/socialOAuth/youtube'
import { mapLinkedInOrganizationsToAccountRows } from '~~/server/utils/socialOAuth/linkedin'
import {
  upsertSocialAccount,
  markWebhookSubscribed,
  type AccountDb,
  type AccountRow
} from '~~/server/utils/socialOAuth/store'
import { getPending, delPending } from '~~/server/utils/socialOAuth/pending'
import { getSocialOauthStateSecret } from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import {
  executeGodModeSocialPublishingAccountComplete
} from '~~/server/utils/social/publishingAccountGodMode'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'

interface CompletionResult {
  id: string
  connected: string[]
  conflicts: string[]
}

function accountDb(db: GodModeTransactionDb): AccountDb {
  return {
    queryOne: async <T = unknown>(sql: string, params: unknown[] = []) => {
      const result = await db.query(sql, params)
      return (result.rows[0] as T | undefined) ?? null
    },
    execute: async (sql: string, params: unknown[] = []) => {
      const result = await db.query(sql, params)
      return result.rowCount ?? 0
    }
  }
}

async function saveRows(
  db: AccountDb,
  rows: AccountRow[],
  clientId: string,
  userId: string
): Promise<Pick<CompletionResult, 'connected' | 'conflicts'>> {
  const connected: string[] = []
  const conflicts: string[] = []
  for (const row of rows) {
    const result = await upsertSocialAccount(db, clientId, row, userId)
    if (result.status === 'conflict') {
      conflicts.push(`${row.account_name} -> ${result.conflictClientName || 'another client'}`)
    } else {
      connected.push(row.account_name)
    }
  }
  return { connected, conflicts }
}

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

  await requireSocialClientAccess(event, sel.clientId)

  const result = await executeGodModeSocialPublishingAccountComplete<CompletionResult>(event, async (db) => {
    const pending = await getPending(event, sel.nonce)
    if (!pending || pending.clientId !== sel.clientId) {
      throw createError({ statusCode: 410, statusMessage: 'selection expired' })
    }
    const store = accountDb(db)

    if (pending.platform === 'google-business') {
      const google = pending.googleBusiness
      if (!google) throw createError({ statusCode: 410, statusMessage: 'selection expired' })
      const chosen = google.locations.filter(location => pageIds.includes(location.id))
      if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching locations' })
      const saved = await saveRows(store, mapGoogleBusinessLocationsToAccountRows(
        chosen,
        google.accessToken,
        google.refreshToken,
        pending.expiresAt
      ), pending.clientId, String(user.id))
      return { id: sel.nonce, ...saved }
    }

    if (pending.platform === 'youtube') {
      const youtube = pending.youtube
      if (!youtube) throw createError({ statusCode: 410, statusMessage: 'selection expired' })
      const chosen = youtube.channels.filter(channel => pageIds.includes(channel.id))
      if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching channels' })
      const saved = await saveRows(store, mapYouTubeChannelsToAccountRows(
        chosen,
        youtube.accessToken,
        youtube.refreshToken,
        pending.expiresAt
      ), pending.clientId, String(user.id))
      return { id: sel.nonce, ...saved }
    }

    if (pending.platform === 'linkedin') {
      const linkedin = pending.linkedin
      if (!linkedin) throw createError({ statusCode: 410, statusMessage: 'selection expired' })
      const chosen = linkedin.organizations.filter(organization => pageIds.includes(organization.id))
      if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching organizations' })
      const saved = await saveRows(store, mapLinkedInOrganizationsToAccountRows(
        chosen,
        linkedin.accessToken,
        linkedin.refreshToken,
        pending.expiresAt
      ), pending.clientId, String(user.id))
      return { id: sel.nonce, ...saved }
    }

    const chosen = (pending.pages ?? []).filter(page => pageIds.includes(page.id))
    if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching pages' })

    const connected: string[] = []
    const conflicts: string[] = []
    // Keep provider latency bounded for operators who select several Pages, while serializing
    // database writes on the one coordinated transaction connection.
    const pageSubscriptions = await Promise.all(chosen.map(async page => ({
      page,
      subscription: await subscribePageWebhook(page.id, page.accessToken)
    })))
    for (const { page, subscription } of pageSubscriptions) {
      const rows = mapPagesToAccountRows(page, pending.expiresAt)
      let pageConflict: string | null = null
      for (const row of rows) {
        row.metadata.webhook_subscribed = subscription.ok
        const saved = await upsertSocialAccount(store, pending.clientId, row, String(user.id))
        if (saved.status === 'conflict') {
          pageConflict = `${page.name} -> ${saved.conflictClientName || 'another client'}`
          break
        }
        if (!subscription.ok) {
          await markWebhookSubscribed(store, saved.id, false, `webhook subscribe failed: ${subscription.error}`)
        }
      }
      if (pageConflict) conflicts.push(pageConflict)
      else connected.push(page.name)
    }
    return { id: sel.nonce, connected, conflicts }
  }, async (_db, resultReference) => {
    if (resultReference !== sel.nonce) {
      throw createError({ statusCode: 409, statusMessage: 'Account completion replay belongs to another selection' })
    }
    return { id: resultReference, connected: [], conflicts: [] }
  })

  // Consume the short-lived OAuth payload only after the durable database mutation has settled.
  await delPending(event, sel.nonce)
  return { connected: result.connected, conflicts: result.conflicts }
})
