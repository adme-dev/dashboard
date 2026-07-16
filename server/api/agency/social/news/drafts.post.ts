/** POST /api/agency/social/news/drafts — turn selected news into reviewed social drafts. */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { assertPublishingTargets, normalizePublishingTargets, normalizeProductionReadyPublishPlatforms } from '~~/server/utils/socialPublishing/guards'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import { GROQ_MODELS } from '~~/server/utils/groqClient'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const body = await readBody<{ newsIds?: string[]; clientId?: string; platforms?: string[]; accountIds?: string[]; targets?: Array<{ platform: string; accountId: string }>; rewrite?: boolean; tone?: string; scheduledAt?: string | null; timezone?: string }>(event)
  const newsIds = Array.isArray(body?.newsIds) ? body.newsIds.filter(Boolean).slice(0, 20) : []
  if (!newsIds.length || !body?.clientId) throw createError({ statusCode: 400, statusMessage: 'newsIds and clientId required' })
  await requireSocialClientAccess(event, body.clientId)
  const requestedAccounts = Array.isArray(body.accountIds) ? body.accountIds : []
  const targetInput = Array.isArray(body.targets) ? body.targets : []
  const explicit = targetInput.length ? await normalizePublishingTargets(body.clientId, targetInput) : null
  const platforms = explicit?.platforms ?? normalizeProductionReadyPublishPlatforms(body.platforms)
  const accountIds = explicit?.accountIds ?? await assertPublishingTargets(body.clientId, platforms, body.accountIds)
  const created: string[] = []
  for (const id of newsIds) {
    const item = await queryOne<{ id: string; title: string; summary: string | null; source_url: string | null }>(
      'SELECT id, title, summary, source_url FROM social_news_items WHERE id = $1 AND status NOT IN (\'dismissed\', \'used\')', [id])
    if (!item) continue
    const content = [item.title, item.summary, item.source_url].filter(Boolean).join('\n\n')
    const overrides: Record<string, { content: string }> = {}
    if (body.rewrite) for (const platform of platforms) {
      overrides[platform] = { content: await generateModelRoutedGroqInsight(
        `Rewrite this news item as an organic ${platform} post in a ${body.tone || 'professional'} tone. Preserve factual meaning. Output only post copy.\n\n${content}`,
        { defaultModelId: GROQ_MODELS.LLAMA_70B, temperature: 0.5, maxTokens: 400, systemPrompt: 'You write concise, factual social copy.', featureKey: 'mcp_news_rewrite', userId: user.id, metadata: { platform, newsItemId: item.id } },
      ) }
    }
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid scheduledAt' })
    const post = await queryOne<{ id: string }>(
      `INSERT INTO social_posts (client_id, created_by, content, link_url, platforms, account_ids, platform_overrides, scheduled_at, timezone, status, metadata, publish_targets)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12::jsonb) RETURNING id`,
      [body.clientId, user.id, content, item.source_url, platforms, accountIds.length ? accountIds : null, JSON.stringify(overrides), scheduledAt?.toISOString() ?? null, body.timezone || 'Australia/Sydney', scheduledAt ? 'scheduled' : 'draft', JSON.stringify({ source: 'mcp_news', newsItemId: item.id }), explicit ? JSON.stringify(explicit.targets) : null])
    if (post) {
      await queryOne('UPDATE social_news_items SET status = \'used\', linked_post_id = $1, updated_at = NOW() WHERE id = $2', [post.id, item.id])
      created.push(post.id)
    }
  }
  return { ok: true, postIds: created }
})
