import { requireSocialInboxClient } from '~~/server/utils/socialInbox/departmentScope'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/inbox/accounts/health?clientId=...
 * Read-only sync/permission diagnostics for the engagement inbox. Tokens are never returned.
 * Omit clientId for all active connected accounts. Department (MARKETING_MANAGEMENT) staff only see
 * active accounts of active clients, and per-account conversation counts only include conversations
 * that the account's own client owns.
 */
export default defineEventHandler(async (event) => {
  const rawClientId = getQuery(event).clientId
  const clientId = typeof rawClientId === 'string' && rawClientId.trim() ? rawClientId : null
  const { department } = await requireSocialInboxClient(event, clientId)
  const departmentAccountSql = department
    ? ' AND a.is_active = TRUE AND EXISTS (SELECT 1 FROM agency_clients ac WHERE ac.id = a.client_id AND ac.is_active = TRUE)'
    : ''

  return await queryRows(
    `SELECT
        a.id,
        a.client_id,
        a.platform,
        a.platform_account_id,
        a.account_name,
        a.is_active,
        a.last_error,
        a.token_expires_at,
        COALESCE(a.last_synced_at, cursor_stats.last_synced_at) AS last_synced_at,
        COALESCE(cursor_stats.cursor_count, 0)::int AS cursor_count,
        COALESCE(cursor_stats.cursor_error_count, 0)::int AS cursor_error_count,
        COALESCE(conv_stats.conversation_count, 0)::int AS conversation_count,
        conv_stats.latest_message_at,
        CASE
          WHEN a.is_active = FALSE THEN 'inactive'
          WHEN a.token_expires_at IS NOT NULL AND a.token_expires_at < NOW() THEN 'reauth'
          WHEN a.last_error IS NOT NULL OR COALESCE(cursor_stats.cursor_error_count, 0) > 0 THEN 'attention'
          WHEN COALESCE(a.last_synced_at, cursor_stats.last_synced_at) IS NULL THEN 'not_synced'
          ELSE 'healthy'
        END AS status,
        COALESCE(cursor_stats.cursors, '[]'::jsonb) AS cursors
       FROM social_accounts a
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) AS cursor_count,
           COUNT(*) FILTER (WHERE last_error IS NOT NULL) AS cursor_error_count,
           MAX(last_synced_at) AS last_synced_at,
           jsonb_agg(
             jsonb_build_object(
               'channel_type', channel_type,
               'last_synced_at', last_synced_at,
               'last_error', last_error
             )
             ORDER BY channel_type
           ) AS cursors
         FROM social_sync_cursors s
         WHERE s.social_account_id = a.id
       ) cursor_stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS conversation_count, MAX(last_message_at) AS latest_message_at
         FROM social_conversations c
         WHERE c.social_account_id = a.id${department ? ' AND c.client_id = a.client_id' : ''}
       ) conv_stats ON TRUE
      WHERE ${clientId ? 'a.client_id = $1' : 'a.is_active = TRUE'}${departmentAccountSql}
      ORDER BY a.platform, a.account_name NULLS LAST`,
    clientId ? [clientId] : []
  )
})
