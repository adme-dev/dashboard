import { createError } from 'h3'
import { queryOneFresh, queryRowsFresh, execute, transaction } from '~~/server/utils/db'
import { canonicalNewsUrl, DRIVEAGENT_NEWS_ORIGIN, eligiblePublishedStory, NEWS_MAX_AGE_MS, planNewsSlots, type NewsPostingSlot, type PublishedSocialStory } from '~~/server/utils/socialNewsAutopostPlan'

export interface NewsAutopostRule {
  id: string
  client_id: string
  account_id: string
  mode: 'paused' | 'review' | 'automatic'
  configured_by: string
}
export interface NewsAutopostResult { created: number, existing: number, eligible: number, availableSlots: number, message: string }

/** Fixed owned source, manual redirects, timeout and bounded response; never fetch a user URL. */
export async function fetchPublishedNews(fetchImpl: typeof fetch = fetch): Promise<PublishedSocialStory[]> {
  const response = await fetchImpl(`${DRIVEAGENT_NEWS_ORIGIN}/api/news?pageSize=50`, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Published-news feed returned HTTP ${response.status}`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Published-news feed has no response body')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 2_000_000) throw new Error('Published-news feed exceeds the response limit')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as { articles?: unknown[] }
  if (!Array.isArray(payload?.articles)) throw new Error('Published-news feed is malformed')
  const now = new Date()
  return payload.articles.map(item => eligiblePublishedStory(item, now)).filter((item): item is PublishedSocialStory => !!item).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}

export async function checkNewsAutopost(clientId: string, force = false): Promise<NewsAutopostResult | null> {
  // A durable 15-minute lease prevents overlapping cron requests or manual checks.
  const rule = await queryOneFresh<NewsAutopostRule>(
    `UPDATE social_news_autopost_rules SET next_check_at = NOW() + INTERVAL '15 minutes'
      WHERE client_id=$1 AND mode <> 'paused' AND ($2::boolean OR next_check_at <= NOW()) RETURNING *`, [clientId, force])
  if (!rule) return null
  try {
    const stories = await fetchPublishedNews()
    const result = await replenishNewsRule(rule.id, stories)
    await execute(`UPDATE social_news_autopost_rules SET last_checked_at=NOW(), last_error=NULL, last_result=$2::jsonb WHERE id=$1`, [rule.id, JSON.stringify(result)])
    return result
  } catch {
    const message = 'News check failed. The existing calendar is unchanged; the next automatic check will retry.'
    await execute('UPDATE social_news_autopost_rules SET last_checked_at=NOW(), last_error=$2 WHERE id=$1', [rule.id, message])
    throw createError({ statusCode: 502, statusMessage: message })
  }
}

export async function replenishNewsRule(ruleId: string, stories: PublishedSocialStory[]): Promise<NewsAutopostResult> {
  return transaction(async (db) => {
    const ref = (await db.query('SELECT client_id FROM social_news_autopost_rules WHERE id=$1', [ruleId])).rows[0] as { client_id: string } | undefined
    if (!ref) throw new Error('News rule no longer exists')
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended(\'news-autopost:\' || $1::text, 0))', [ref.client_id])
    const rule = (await db.query('SELECT * FROM social_news_autopost_rules WHERE id=$1 FOR UPDATE', [ruleId])).rows[0] as NewsAutopostRule
    const empty: NewsAutopostResult = { created: 0, existing: 0, eligible: stories.length, availableSlots: 0, message: 'News auto-posting is paused.' }
    if (!rule || rule.mode === 'paused') return empty
    const account = (await db.query(`SELECT id FROM social_accounts WHERE id=$1 AND client_id=$2 AND platform='facebook'
      AND is_active=TRUE AND NULLIF(access_token,'') IS NOT NULL AND last_error IS NULL
      AND (token_expires_at IS NULL OR token_expires_at > NOW())`, [rule.account_id, rule.client_id])).rows[0]
    if (!account) throw new Error('Facebook connection needs attention')
    const slots = (await db.query('SELECT * FROM social_slot_schedules WHERE client_id=$1 AND enabled=TRUE', [rule.client_id])).rows as NewsPostingSlot[]
    const posts = (await db.query(`SELECT id,link_url,scheduled_at::text,status FROM social_posts WHERE client_id=$1
      AND 'facebook'=ANY(platforms)
      AND (rtrim(regexp_replace(link_url,'[?#].*$', ''), '/') = ANY($2::text[]) OR scheduled_at BETWEEN NOW() AND NOW()+INTERVAL '7 days')`, [rule.client_id, stories.map(story => story.url)])).rows as Array<{ id: string, link_url: string | null, scheduled_at: string | null, status: string }>
    const imports = (await db.query('SELECT article_id,article_url FROM social_news_autopost_imports WHERE rule_id=$1 AND (article_id=ANY($2::text[]) OR article_url=ANY($3::text[]))', [rule.id, stories.map(story => story.id), stories.map(story => story.url)])).rows as Array<{ article_id: string, article_url: string }>
    const importedIds = new Set(imports.map(item => item.article_id))
    const importedUrls = new Set(imports.map(item => item.article_url))
    const existing = new Map(posts.map(post => [canonicalNewsUrl(post.link_url), post.id]))
    const planned = planNewsSlots(slots, posts.filter(post => post.scheduled_at && ['draft', 'approved', 'scheduled', 'publishing', 'published', 'partially_published'].includes(post.status)) as Array<{ scheduled_at: string }>, new Date())
    const result = { ...empty, availableSlots: planned.length, message: '' }
    for (const story of stories) {
      if (importedIds.has(story.id) || importedUrls.has(story.url)) continue
      const existingId = existing.get(story.url)
      if (existingId) {
        await db.query(`INSERT INTO social_news_autopost_imports(rule_id,article_id,article_url,title,published_at,post_id,outcome)
          VALUES($1,$2,$3,$4,$5,$6,'existing') ON CONFLICT DO NOTHING`, [rule.id, story.id, story.url, story.title, story.publishedAt, existingId])
        result.existing++
        importedIds.add(story.id)
        importedUrls.add(story.url)
        continue
      }
      if (result.created >= 5 || !planned.length) continue
      const slot = planned[0]!
      if (Date.parse(slot.at) - Date.parse(story.publishedAt) > NEWS_MAX_AGE_MS) continue
      const automatic = rule.mode === 'automatic'
      const metadata = { source: 'driveagent-publication', newsAutopostRuleId: rule.id, newsAutopostAutomatic: automatic, articleId: story.id, publishedAt: story.publishedAt, slotId: slot.slotId }
      const post = (await db.query(`INSERT INTO social_posts(client_id,created_by,content,media_urls,link_url,platforms,account_ids,publish_targets,
        scheduled_at,timezone,status,approved_by,approved_at,approval_requested_by,approval_requested_at,metadata)
        VALUES($1,$2,$3,$4,$5,ARRAY['facebook'],ARRAY[$6::uuid],$7::jsonb,$8,$9,$10,
          CASE WHEN $11 THEN $2 ELSE NULL END,CASE WHEN $11 THEN NOW() ELSE NULL END,
          CASE WHEN $11 THEN NULL ELSE $2 END,CASE WHEN $11 THEN NULL ELSE NOW() END,$12::jsonb) RETURNING id`,
      [rule.client_id, rule.configured_by, story.content, [story.mediaUrl], story.url, rule.account_id,
        JSON.stringify([{ platform: 'facebook', accountId: rule.account_id }]), slot.at, slot.timezone, automatic ? 'scheduled' : 'draft', automatic, JSON.stringify(metadata)])).rows[0]!
      await db.query(`INSERT INTO social_news_autopost_imports(rule_id,article_id,article_url,title,published_at,post_id,outcome)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [rule.id, story.id, story.url, story.title, story.publishedAt, post.id, automatic ? 'scheduled' : 'review'])
      await db.query(`INSERT INTO social_publishing_audit_events(client_id,post_id,social_account_id,actor_id,action,metadata)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [rule.client_id, post.id, rule.account_id, rule.configured_by, automatic ? 'post_scheduled' : 'approval_requested', JSON.stringify({ ...metadata, approvalPolicy: automatic ? 'client-opted-in-published-news' : 'staff-review' })])
      importedIds.add(story.id)
      importedUrls.add(story.url)
      planned.shift()
      result.created++
    }
    result.message = result.created
      ? `${result.created} news post${result.created === 1 ? '' : 's'} ${rule.mode === 'automatic' ? 'scheduled' : 'sent for review'}.`
      : !result.availableSlots
          ? 'Upcoming news slots are occupied or no news slots are configured. Existing posts are preserved.'
          : 'No new eligible stories fit the available slots. Stories must be published within 72 hours of their planned post.'
    return result
  })
}

export async function dueNewsAutopostClients(): Promise<string[]> {
  return (await queryRowsFresh<{ client_id: string }>('SELECT client_id FROM social_news_autopost_rules WHERE mode <> \'paused\' AND next_check_at <= NOW() ORDER BY next_check_at LIMIT 5')).map(row => row.client_id)
}
