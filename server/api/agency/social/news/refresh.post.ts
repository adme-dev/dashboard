/** POST /api/agency/social/news/refresh — pull the configured MCP source into the inbox. */
import { requirePermission } from '~~/server/utils/auth'
import { queryRows, execute } from '~~/server/utils/db'
import { normalizeMcpNewsItem } from '~~/server/utils/socialNews'
import { fetchMcpNewsSource, sourceFromRow } from '~~/server/utils/socialNewsSources'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const rows = await queryRows('SELECT source_key, display_name, endpoint_url, enabled, settings FROM social_news_sources WHERE enabled = TRUE ORDER BY display_name')
  let accepted = 0
  for (const row of rows) {
    const source = sourceFromRow(row)
    const rawItems = await fetchMcpNewsSource(source)
    for (const raw of rawItems) {
      const item = normalizeMcpNewsItem(raw)
      if (!item) continue
      await execute(`INSERT INTO social_news_items (source, external_id, source_url, title, summary, author, published_at, raw)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        ON CONFLICT (source, external_id) DO UPDATE SET source_url=EXCLUDED.source_url, title=EXCLUDED.title, summary=EXCLUDED.summary, author=EXCLUDED.author, published_at=EXCLUDED.published_at, raw=EXCLUDED.raw, updated_at=NOW()
        WHERE social_news_items.status NOT IN ('used','dismissed')`,
      [source.sourceKey, item.externalId, item.url, item.title, item.summary, item.author, item.publishedAt, JSON.stringify(item.raw ?? {})])
      accepted++
    }
  }
  return { ok: true, sources: rows.length, accepted }
})
