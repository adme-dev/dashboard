/**
 * Auto Feed rules cron — POST /api/cron/feed-post-rules
 * Header: x-cron-secret: $CRON_SECRET (skipped in dev).
 *
 * For each enabled feed_post_rules row: pull the client's current vehicle
 * feed items (same FeedProvider plumbing as the Auto Feed page), and for
 * items matching the rule's event types that haven't been executed before,
 * create a DRAFT social post (never scheduled/published automatically) and
 * notify the rule's owner. Dedupe via feed_rule_executions.
 *
 * Flag-gated by DEALER_FEEDS_ENABLED; cron trigger intentionally NOT
 * registered until the operator enables it.
 */

import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { loadAutoFeedInventory } from '~~/server/utils/feeds/autoFeedInventory'

const ITEMS_PER_CLIENT = 25
const MAX_DRAFTS_PER_RUN_PER_RULE = 5 // guard against a first run flooding drafts

function renderCaption(template: string | null, item: { title: string; price: number | null; stockNumber: string | null; url: string | null }): string {
  const price = typeof item.price === 'number' && item.price > 0
    ? item.price.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
    : ''
  const base = template && template.trim().length
    ? template
    : '{title}\n{price}\n{url}'
  return base
    .replaceAll('{title}', item.title)
    .replaceAll('{price}', price)
    .replaceAll('{stock}', item.stockNumber ?? '')
    .replaceAll('{url}', item.url ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (!isDealerFeedsEnabled(mergedRuntimeEnv(event))) {
    return { ok: true, skipped: 'dealer feeds disabled' }
  }
  const socialDashboardClient = await getSocialDashboardClient({ runtimeEnv: cloudflareRuntimeEnv(event) })
  if (!socialDashboardClient) {
    return { ok: true, skipped: 'feed provider not configured' }
  }

  const rules = await queryRows<any>(
    `SELECT id, client_id, event_types, caption_template, notify_user_id, created_by
       FROM feed_post_rules WHERE enabled = true ORDER BY created_at ASC LIMIT 50`,
  )
  if (!rules.length) return { ok: true, rules: 0, drafts: 0 }

  let drafts = 0
  const errors: string[] = []

  for (const rule of rules) {
    try {
      const link = await getDealerLink(rule.client_id)
      if (!link) continue
      const provider = getFeedProvider(link.providerId, { socialDashboardClient })
      const ctx = linkToContext(link, rule.created_by || 'cron@xeroflow.io')
      const { preview } = await loadAutoFeedInventory(provider, ctx, link, ITEMS_PER_CLIENT)

      let created = 0
      for (const v of preview.items) {
        if (created >= MAX_DRAFTS_PER_RUN_PER_RULE) break
        const eventType = v.condition && /new/i.test(v.condition) ? 'new' : 'listing'
        if (!(rule.event_types as string[]).includes(eventType)) continue
        const feedItemId = `${rule.client_id}:${v.id}`

        const already = await queryOne(
          `SELECT 1 AS x FROM feed_rule_executions WHERE rule_id = $1 AND feed_item_id = $2`,
          [rule.id, feedItemId],
        )
        if (already) continue

        const title = [v.year, v.make, v.model].filter(Boolean).join(' ') || v.stockNumber || 'Vehicle'
        const caption = renderCaption(rule.caption_template, { title, price: v.price, stockNumber: v.stockNumber, url: v.url })
        const post = await queryOne<{ id: string }>(
          `INSERT INTO social_posts (client_id, created_by, content, media_urls, platforms, status)
           VALUES ($1, $2, $3, $4, '{}', 'draft')
           RETURNING id`,
          [rule.client_id, rule.created_by || 'auto-feed-rule', caption, v.image ? [v.image] : []],
        )
        await execute(
          `INSERT INTO feed_rule_executions (rule_id, feed_item_id, social_post_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [rule.id, feedItemId, post?.id ?? null],
        )
        created++
        drafts++

        if (rule.notify_user_id && post?.id) {
          await createNotification({
            userId: rule.notify_user_id,
            type: 'system',
            title: 'Auto Feed draft created',
            message: `New ${eventType} item "${title}" was drafted for review.`,
            link: `/agency/social/publishing/compose?edit=${post.id}`,
            metadata: { ruleId: rule.id, feedItemId },
          })
        }
      }
    } catch (err: any) {
      errors.push(`${rule.id}: ${err?.message}`)
      console.warn('[feed-post-rules] rule failed', rule.id, err?.message)
    }
  }

  return { ok: errors.length === 0, rules: rules.length, drafts, errors }
})
