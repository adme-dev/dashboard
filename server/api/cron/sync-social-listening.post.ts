// server/api/cron/sync-social-listening.post.ts
// Slice 4b poll collector. Invoked by the social-listening-cron companion Worker (Pages has no
// scheduled()). For each enabled listening query, runs the selected+enabled external sources,
// matches include/exclude terms, and upserts mentions (4a upsertMentions). External mentions land
// un-enriched (enriched_at NULL) for the 4c Groq pass. Sources are gated per key/flag — with no
// keys set this is a no-op. No send, no gate flag of its own (collection is read-only inbound).
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { collectForQuery } from '~~/server/utils/socialListening/collect'
import { upsertMentions } from '~~/server/utils/socialListening/store'
import { LISTENING_SOURCES } from '~~/server/utils/socialListening/sources/registry'
import { enrichUnenriched } from '~~/server/utils/socialListening/enrich'
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import { dispatchListeningAlerts } from '~~/server/utils/socialListening/alerts'
import { createNotification } from '~~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const env = process.env as Record<string, string | undefined>

  const queries = await queryRows<any>(
    `SELECT id, client_id, include_terms, exclude_terms, sources FROM social_listening_queries WHERE enabled = TRUE`,
  )
  let queriesRun = 0
  let mentionsUpserted = 0
  for (const q of queries) {
    if (!Array.isArray(q.sources) || q.sources.length === 0) continue
    const hits = await collectForQuery(q, LISTENING_SOURCES, env, fetch)
    if (hits.length) mentionsUpserted += await upsertMentions({ queryRows, queryOne, execute }, q.client_id, q.id, hits)
    queriesRun++
  }
  // Enrich any mentions still missing sentiment/topics (this run's + any backlog). Fail-safe.
  const enriched = await enrichUnenriched(
    { queryRows, execute },
    (prompt) => generateModelRoutedGroqInsight(prompt, {
      defaultModelId: GROQ_MODELS.LLAMA_8B,
      maxTokens: 500,
      featureKey: 'social_listening_enrichment',
      requestId: 'cron-sync-social-listening',
      metadata: {
        route: '/api/cron/sync-social-listening',
        enabledQueryCount: queries.length,
        queriesRun,
        mentionsUpserted,
        promptChars: prompt.length,
      },
      systemPrompt: 'You are a precise social-media sentiment classifier. Output only JSON.',
    }),
  )
  const alerts = await dispatchListeningAlerts({
    db: { queryRows, execute }, env: process.env as Record<string, string | undefined>,
    notify: createNotification, baseUrl: process.env.APP_BASE_URL || '',
  })
  return { ok: true, queriesRun, mentionsUpserted, enriched, alerts }
})
