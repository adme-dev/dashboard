// server/utils/socialListening/store.ts
// Injected-runner data layer for Social Listening. Mirrors socialReporting/store.ts:
// all SQL lives here, deps injected so the upsert/sync logic is unit-testable with a fake runner.
import { projectConversationToMention } from '~~/server/utils/socialListening/ownedProjection'
import type { ConversationRow, RawMention } from '~~/server/utils/socialListening/types'

export interface ListeningDbRunner {
  queryRows: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  queryOne: <T = any>(sql: string, params?: any[]) => Promise<T | null>
  execute: (sql: string, params?: any[]) => Promise<number>
}

/** Idempotent upsert of a batch of mentions. enriched_at is stamped only when sentiment is known
 *  (owned signals); external mentions leave it null so the 4c enrichment pass picks them up. */
export async function upsertMentions(
  db: ListeningDbRunner, clientId: string, queryId: string | null, mentions: RawMention[],
): Promise<number> {
  let n = 0
  for (const m of mentions) {
    const enrichedFrag = m.sentiment !== undefined ? 'NOW()' : 'NULL'
    await db.execute(
      `INSERT INTO social_listening_mentions
         (client_id, query_id, source, external_id, url, author, title, content, lang, published_at,
          sentiment, sentiment_score, enriched_at, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,${enrichedFrag},$13::jsonb)
       ON CONFLICT (source, external_id) DO UPDATE SET
         url = EXCLUDED.url, author = EXCLUDED.author, title = EXCLUDED.title,
         content = EXCLUDED.content, published_at = EXCLUDED.published_at, raw = EXCLUDED.raw`,
      [clientId, queryId, m.source, m.externalId, m.url, m.author, m.title, m.content, m.lang,
       m.publishedAt, m.sentiment ?? null, m.sentimentScore ?? null, JSON.stringify(m.raw ?? {})],
    )
    n++
  }
  return n
}

/** Project the client's inbox conversations (Slice 2) into owned mentions and upsert them. */
export async function syncOwnedSignals(db: ListeningDbRunner, clientId: string): Promise<number> {
  const rows = await db.queryRows<ConversationRow>(
    `SELECT id, platform, channel_type, permalink, participant_name, last_message_preview,
            sentiment, last_message_at
       FROM social_conversations WHERE client_id = $1`, [clientId])
  const mentions = rows.map(projectConversationToMention)
  return upsertMentions(db, clientId, null, mentions)
}
