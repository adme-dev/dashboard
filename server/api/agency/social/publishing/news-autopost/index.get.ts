import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string
  await requireSocialClientAccess(event, clientId)
  const rule = await queryOneFresh(`SELECT r.*,a.account_name FROM social_news_autopost_rules r
    JOIN social_accounts a ON a.id=r.account_id WHERE r.client_id=$1`, [clientId])
  const imports = rule
    ? await queryRowsFresh(`SELECT i.article_id,i.article_url,i.title,i.outcome,i.created_at,p.id AS post_id,p.status,p.scheduled_at
    FROM social_news_autopost_imports i LEFT JOIN social_posts p ON p.id=i.post_id
    WHERE i.rule_id=$1 ORDER BY i.created_at DESC LIMIT 20`, [rule.id])
    : []
  return { rule, imports, sourceName: 'DriveAgent published news', sourceUrl: 'https://driveagent.news', intervalMinutes: 15, maxStoryAgeHours: 72, horizonDays: 7 }
})
