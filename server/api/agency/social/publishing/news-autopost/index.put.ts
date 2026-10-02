import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { transaction } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const schema = z.object({ clientId: z.string().uuid(), accountId: z.string().uuid(), mode: z.enum(['paused', 'review', 'automatic']) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.MANAGEMENT)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose a client, Facebook account and valid mode' })
  const body = parsed.data
  await requireSocialClientAccess(event, body.clientId)
  return transaction(async (db) => {
    // Lock the client first, including initial creation, then read the current rule.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended(\'news-autopost:\' || $1::text, 0))', [body.clientId])
    const previous = (await db.query('SELECT * FROM social_news_autopost_rules WHERE client_id=$1 FOR UPDATE', [body.clientId])).rows[0]
    const account = (await db.query(`SELECT id FROM social_accounts WHERE id=$1 AND client_id=$2 AND platform='facebook'
      AND ($3 = 'paused' OR (is_active=TRUE AND NULLIF(access_token,'') IS NOT NULL AND last_error IS NULL AND (token_expires_at IS NULL OR token_expires_at > NOW())))`, [body.accountId, body.clientId, body.mode])).rows[0]
    if (!account && !(body.mode === 'paused' && previous?.account_id === body.accountId)) throw createError({ statusCode: 400, statusMessage: 'Choose an active Facebook account for this client; reconnect it if needed' })
    const rule = (await db.query(`INSERT INTO social_news_autopost_rules(client_id,account_id,mode,configured_by)
      VALUES($1,$2,$3,$4) ON CONFLICT(client_id) DO UPDATE SET account_id=EXCLUDED.account_id,mode=EXCLUDED.mode,
        configured_by=EXCLUDED.configured_by,next_check_at=NOW(),updated_at=NOW() RETURNING *`, [body.clientId, body.accountId, body.mode, user.id])).rows[0]!
    let cancelled = 0
    if (previous && (body.mode !== 'automatic' || previous.account_id !== body.accountId)) {
      const result = await db.query(`UPDATE social_posts SET status='cancelled',updated_at=NOW()
        WHERE client_id=$1 AND status='scheduled' AND metadata->>'newsAutopostRuleId'=$2
          AND metadata->>'newsAutopostAutomatic'='true' RETURNING id`, [body.clientId, rule.id])
      cancelled = result.rows.length
    }
    await db.query(`INSERT INTO social_publishing_audit_events(client_id,social_account_id,actor_id,action,metadata)
      VALUES($1,$2,$3,'news_autopost_configured',$4::jsonb)`, [body.clientId, body.accountId, user.id, JSON.stringify({ ruleId: rule.id, previousMode: previous?.mode ?? null, mode: body.mode, cancelled })])
    return { rule, cancelled }
  })
})
