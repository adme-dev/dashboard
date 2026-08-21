import { z } from 'zod'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import { queryOne } from '~~/server/utils/db'
import { refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import {
  findGoogleProfileAccount,
  linkGoogleCredentialProfileAccount,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow
} from '~~/server/utils/googleCredentialProfiles'
import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { executeGodModeGoogleProfileAccountDiscovery } from '~~/server/utils/social/googleProfileAccountDiscoveryGodMode'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

const BodySchema = z.strictObject({
  customerId: z.string().transform(value => value.replaceAll('-', '')).pipe(z.string().regex(/^\d{10}$/))
})

interface ProfileRow extends GoogleCredentialRow {
  connected_by: string
  scopes: string[] | null
  metadata: unknown
}

interface SafeConnection {
  connectionId: string
  accountId: string
  accountName: string
  managerCustomerId: string | null
}

export default defineEventHandler(async (event) => {
  const actor = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  await requireWriteAccess(event)
  const profileId = getRouterParam(event, 'id')
  const parsedBody = BodySchema.safeParse(await readBody(event))
  if (!profileId || !z.string().uuid().safeParse(profileId).success || !parsedBody.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Google account discovery request' })
  }

  const profile = await queryOne<ProfileRow>(
    `SELECT id, NULL::text AS access_token, NULL::text AS refresh_token,
            NULL::timestamptz AS token_expires_at,
            id AS google_credential_profile_id,
            access_token_encrypted AS profile_access_token_encrypted,
            access_token_iv AS profile_access_token_iv,
            refresh_token_encrypted AS profile_refresh_token_encrypted,
            refresh_token_iv AS profile_refresh_token_iv,
            token_expires_at AS profile_token_expires_at,
            connected_by, scopes, metadata
       FROM google_credential_profiles
      WHERE id = $1
        AND status = 'active'
      LIMIT 1`,
    [profileId]
  )
  if (!profile) {
    throw createError({ statusCode: 404, statusMessage: 'Google credential profile not found' })
  }

  const config = resolveGoogleAdsRuntimeConfig(undefined, event)
  let credential
  try {
    credential = await resolveGoogleCredential(profile)
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Google Ads connection must be reconnected' })
  }

  let accessToken = credential.accessToken
  let tokenExpiresAt = credential.tokenExpiresAt
    ? new Date(credential.tokenExpiresAt)
    : new Date(0)
  if (!Number.isFinite(tokenExpiresAt.getTime()) || tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
    if (!credential.refreshToken || !config.googleClientId || !config.googleClientSecret) {
      throw createError({ statusCode: 401, statusMessage: 'Google Ads connection must be reconnected' })
    }
    try {
      const refreshed = await refreshGoogleToken(
        credential.refreshToken,
        config.googleClientId,
        config.googleClientSecret
      )
      accessToken = refreshed.access_token
      tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
      await persistGoogleCredentialRefresh({
        connectionId: profile.id,
        profileId: credential.profileId,
        accessToken,
        expiresAt: tokenExpiresAt
      })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Google Ads connection must be reconnected' })
    }
  }

  let account
  try {
    account = await findGoogleProfileAccount({
      accessToken,
      developerToken: config.googleDeveloperToken,
      targetCustomerId: parsedBody.data.customerId,
      profileMetadata: profile.metadata
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Google Ads account discovery failed' })
  }
  if (!account) {
    throw createError({ statusCode: 404, statusMessage: 'Google Ads customer is not accessible through this profile' })
  }

  return await executeGodModeGoogleProfileAccountDiscovery(event, async db => (
    await linkGoogleCredentialProfileAccount({
      profileId,
      userId: actor.id,
      tokenExpiresAt,
      scopes: profile.scopes || [],
      account
    }, { runTransaction: async callback => await callback(db) })
  ), async (db, resultReference) => {
    const result = await db.query(
      `SELECT sc.id, sc.account_id, sc.account_name,
              gcpa.manager_customer_id
         FROM social_connections sc
         JOIN google_credential_profile_accounts gcpa
           ON gcpa.connection_id = sc.id
          AND gcpa.profile_id = $2
        WHERE sc.id = $1
          AND sc.account_id = $3
        LIMIT 1`,
      [resultReference, profileId, parsedBody.data.customerId]
    )
    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) {
      throw createError({ statusCode: 409, statusMessage: 'Discovered Google Ads account no longer exists' })
    }
    return {
      connectionId: String(row.id),
      accountId: String(row.account_id),
      accountName: String(row.account_name),
      managerCustomerId: row.manager_customer_id ? String(row.manager_customer_id) : null
    } satisfies SafeConnection
  })
})
