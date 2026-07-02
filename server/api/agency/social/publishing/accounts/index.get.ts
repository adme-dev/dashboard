import { queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { classifySocialPublishingAccountHealth } from '~~/server/utils/socialPublishing/accountHealth'

interface SocialAccountRow {
  id: string
  client_id: string
  platform: string
  platform_account_id: string
  account_name: string | null
  is_active: boolean
  last_error: string | null
  token_expires_at: string | null
  last_synced_at: string | null
  metadata: Record<string, unknown> | string | null
  created_at: string
  has_refresh_token: boolean
  linked_facebook_account_id: string | null
  linked_facebook_account_name: string | null
  linked_facebook_is_active: boolean | null
}

function parseMetadata(value: SocialAccountRow['metadata']): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return value
}

/**
 * GET /api/agency/social/publishing/accounts?clientId=...
 * List a client's connected publishing accounts (page/profile tokens), never returning the raw token.
 */
export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  const rows = await queryRows<SocialAccountRow>(
    `SELECT sa.id, sa.client_id, sa.platform, sa.platform_account_id, sa.account_name, sa.is_active,
            sa.last_error, sa.token_expires_at, sa.last_synced_at, sa.metadata, sa.created_at,
            (NULLIF(sa.refresh_token, '') IS NOT NULL) AS has_refresh_token,
            linked_fb.id AS linked_facebook_account_id,
            linked_fb.account_name AS linked_facebook_account_name,
            linked_fb.is_active AS linked_facebook_is_active
       FROM social_accounts sa
       LEFT JOIN social_accounts linked_fb
         ON sa.platform = 'instagram'
        AND linked_fb.client_id = sa.client_id
        AND linked_fb.platform = 'facebook'
        AND linked_fb.platform_account_id = sa.metadata->>'via_page_id'
      WHERE sa.client_id = $1
      ORDER BY sa.platform, sa.account_name NULLS LAST`,
    [clientId]
  )
  return rows.map((row) => {
    const metadata = parseMetadata(row.metadata)
    const health = classifySocialPublishingAccountHealth({
      platform: row.platform,
      isActive: row.is_active,
      lastError: row.last_error,
      tokenExpiresAt: row.token_expires_at,
      hasRefreshToken: row.has_refresh_token,
      metadata,
      linkedFacebookAccountId: row.linked_facebook_account_id,
      linkedFacebookIsActive: row.linked_facebook_is_active
    })
    return {
      id: row.id,
      client_id: row.client_id,
      platform: row.platform,
      platform_account_id: row.platform_account_id,
      account_name: row.account_name,
      is_active: row.is_active,
      last_error: row.last_error,
      token_expires_at: row.token_expires_at,
      last_synced_at: row.last_synced_at,
      metadata,
      created_at: row.created_at,
      has_refresh_token: row.has_refresh_token,
      linked_facebook_account_id: row.linked_facebook_account_id,
      linked_facebook_account_name: row.linked_facebook_account_name,
      connection_health: health.health,
      connection_health_label: health.healthLabel,
      connection_health_reason: health.healthReason,
      requires_reconnect: health.requiresReconnect,
      days_until_expiry: health.daysUntilExpiry
    }
  })
})
