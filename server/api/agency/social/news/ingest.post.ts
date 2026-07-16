/** POST /api/agency/social/news/ingest — upsert normalized MCP items into the inbox. */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { normalizeMcpNewsItem } from '~~/server/utils/socialNews'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.ADMIN)
  const body = await readBody<{ items?: Record<string, unknown>[] }>(event)
  const inputs = Array.isArray(body?.items) ? body.items : []
  if (inputs.length > 200) throw createError({ statusCode: 400, statusMessage: 'Maximum 200 news items per ingest' })
  let accepted = 0
  for (const input of inputs) {
    const item = normalizeMcpNewsItem(input)
    if (!item) continue
    await execute(
      `INSERT INTO social_news_items (source, external_id, source_url, title, summary, author, published_at, raw)
       VALUES ('mcp_news', $1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (source, external_id) DO UPDATE SET
         source_url = EXCLUDED.source_url, title = EXCLUDED.title, summary = EXCLUDED.summary,
         author = EXCLUDED.author, published_at = EXCLUDED.published_at, raw = EXCLUDED.raw, updated_at = NOW()
       WHERE social_news_items.status NOT IN ('used', 'dismissed')`,
      [item.externalId, item.url, item.title, item.summary, item.author, item.publishedAt, JSON.stringify(item.raw ?? {})],
    )
    accepted++
  }
  return { ok: true, accepted }
})
