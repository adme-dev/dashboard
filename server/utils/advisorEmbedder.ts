/**
 * Vector embedding for Financial Advisor recommendations.
 *
 * Stores each recommendation in the shared `agency-search` Vectorize
 * index with `metadata.type = 'advisor-rec'` so queries can filter to
 * only advisor rows. Drives the "Related past advice" and "still open
 * from prior months" features in Phase 2.
 */

import type { H3Event } from 'h3'
import { generateEmbedding, upsertVector, deleteVector } from './aiVectorize'
import { execute } from './db'

const VECTOR_TYPE = 'advisor-rec'

function buildText(rec: {
  title: string
  action: string
  impact?: string | null
  client_name?: string | null
  period_label?: string | null
}): string {
  const scope = rec.client_name ? `Client: ${rec.client_name}` : 'Scope: agency books'
  return [
    scope,
    rec.period_label ? `Period: ${rec.period_label}` : '',
    `Title: ${rec.title}`,
    `Action: ${rec.action}`,
    rec.impact ? `Impact: ${rec.impact}` : '',
  ].filter(Boolean).join('\n')
}

/**
 * Embed a single recommendation and upsert to Vectorize.
 * Best-effort: returns null without throwing if bindings are missing.
 * Also writes the vector_id back onto the DB row.
 */
export async function embedRecommendation(
  event: H3Event,
  rec: {
    id: string
    tenant_id: string
    client_id?: string | null
    client_name?: string | null
    source_report_id?: string | null
    period_key?: string | null
    period_label?: string | null
    title: string
    action: string
    impact?: string | null
    priority: string
    status: string
  }
): Promise<string | null> {
  const text = buildText(rec)
  const embedding = await generateEmbedding(event, text)
  if (embedding.length === 0) return null

  const vectorId = `advisor-rec:${rec.id}`
  const metadata: Record<string, string> = {
    type: VECTOR_TYPE,
    tenant_id: rec.tenant_id,
    recommendation_id: rec.id,
    title: rec.title.slice(0, 200),
    priority: rec.priority,
    status: rec.status,
  }
  if (rec.client_id) metadata.client_id = rec.client_id
  if (rec.client_name) metadata.client_name = rec.client_name.slice(0, 200)
  if (rec.period_key) metadata.period_key = rec.period_key
  if (rec.period_label) metadata.period_label = rec.period_label
  if (rec.source_report_id) metadata.source_report_id = rec.source_report_id

  await upsertVector(event, vectorId, embedding, metadata)

  try {
    await execute(
      `UPDATE recommendations SET vector_id = $1 WHERE id = $2`,
      [vectorId, rec.id]
    )
  } catch (err: any) {
    console.warn('[advisorEmbedder] failed to persist vector_id:', err?.message ?? err)
  }

  return vectorId
}

/**
 * Remove a recommendation's vector on hard delete.
 * Kept narrow — status changes don't need to re-embed.
 */
export async function deleteRecommendationVector(event: H3Event, recommendationId: string): Promise<void> {
  await deleteVector(event, `advisor-rec:${recommendationId}`)
}

export const ADVISOR_VECTOR_TYPE = VECTOR_TYPE

/**
 * Find recommendations semantically similar to the given text, scoped
 * to the tenant's advisor rows. Returns the raw Vectorize matches — the
 * caller joins back to Postgres for full rows.
 */
export async function searchSimilarAdvisor(
  event: H3Event,
  text: string,
  tenantId: string,
  topK = 5,
  excludeVectorId?: string
): Promise<Array<{ id: string; score: number; recommendation_id: string; metadata: Record<string, any> }>> {
  const vectorize = (event.context as any).cloudflare?.env?.VECTORIZE ?? null
  if (!vectorize) return []

  const embedding = await generateEmbedding(event, text)
  if (embedding.length === 0) return []

  try {
    const result = await vectorize.query(embedding, {
      topK: Math.max(topK + (excludeVectorId ? 1 : 0), 1),
      returnMetadata: 'all',
      filter: {
        type: VECTOR_TYPE,
        tenant_id: tenantId,
      },
    })

    const matches = result?.matches ?? []
    return matches
      .filter((m: any) => m.id !== excludeVectorId)
      .slice(0, topK)
      .map((m: any) => ({
        id: m.id,
        score: m.score,
        recommendation_id: m.metadata?.recommendation_id ?? '',
        metadata: m.metadata ?? {},
      }))
  } catch (err: any) {
    console.error('[advisorEmbedder] similarity search failed:', err?.message ?? err)
    return []
  }
}
