/**
 * Cloudflare Vectorize bindings for semantic search.
 * Uses Workers AI @cf/baai/bge-base-en-v1.5 (768 dimensions) for embeddings
 * and a Vectorize index for similarity search.
 *
 * All calls are wrapped in try/catch since bindings may not be available in dev.
 */

import type { H3Event } from 'h3'

function getAiBinding(event?: H3Event): any | null {
  if (event) {
    try {
      return (event.context as any).cloudflare?.env?.AI ?? null
    } catch { /* fall through */ }
  }
  // Legacy fallback for non-event contexts
  try {
    const env = (globalThis as any).__env__
    if (env?.AI) return env.AI
    return null
  } catch {
    return null
  }
}

function getVectorizeBinding(event?: H3Event): any | null {
  if (event) {
    try {
      return (event.context as any).cloudflare?.env?.VECTORIZE ?? null
    } catch { /* fall through */ }
  }
  try {
    const env = (globalThis as any).__env__
    if (env?.VECTORIZE) return env.VECTORIZE
    return null
  } catch {
    return null
  }
}

/**
 * Generate a 768-dimension embedding using Workers AI bge-base-en-v1.5.
 * Returns an empty array if the AI binding is not available.
 * Accepts (text) or (event, text) for backward compatibility.
 */
export async function generateEmbedding(textOrEvent: string | H3Event, textArg?: string): Promise<number[]> {
  let event: H3Event | undefined
  let text: string
  if (typeof textOrEvent === 'string') {
    text = textOrEvent
  } else {
    event = textOrEvent
    text = textArg!
  }

  const ai = getAiBinding(event)
  if (!ai) {
    console.warn('[aiVectorize] AI binding not available, skipping embedding generation')
    return []
  }

  try {
    // Truncate text to fit model's token limit (~512 tokens ~ 2000 chars)
    const truncated = text.length > 2000 ? text.slice(0, 2000) : text
    const result = await ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [truncated],
    })

    if (result?.data?.[0]) {
      return Array.from(result.data[0])
    }

    return []
  } catch (err) {
    console.error('[aiVectorize] Embedding generation failed:', err)
    return []
  }
}

/**
 * Upsert a vector into the Vectorize index.
 * No-op if the Vectorize binding is not available.
 * Accepts (id, values, metadata) or (event, id, values, metadata) for backward compatibility.
 */
export async function upsertVector(
  eventOrId: H3Event | string,
  idOrValues: string | number[],
  valuesOrMetadata: number[] | Record<string, string>,
  metadataArg?: Record<string, string>
): Promise<void> {
  let event: H3Event | undefined
  let id: string
  let values: number[]
  let metadata: Record<string, string>
  if (typeof eventOrId === 'string') {
    id = eventOrId
    values = idOrValues as number[]
    metadata = valuesOrMetadata as Record<string, string>
  } else {
    event = eventOrId
    id = idOrValues as string
    values = valuesOrMetadata as number[]
    metadata = metadataArg!
  }

  const vectorize = getVectorizeBinding(event)
  if (!vectorize) {
    console.warn('[aiVectorize] VECTORIZE binding not available, skipping upsert')
    return
  }

  if (values.length === 0) {
    console.warn('[aiVectorize] Empty embedding values, skipping upsert')
    return
  }

  try {
    await vectorize.upsert([{
      id,
      values,
      metadata,
    }])
  } catch (err) {
    console.error('[aiVectorize] Vector upsert failed:', err)
  }
}

/** Vectorize metadata filter (e.g. { userId, scope, memType } for per-user memory recall). */
export type VectorizeFilter = Record<string, unknown>

export interface ResolvedSearchArgs {
  event?: H3Event
  query: string
  topK: number
  filter?: VectorizeFilter
}

function isFilter(v: unknown): v is VectorizeFilter {
  return typeof v === 'object' && v !== null
}

/**
 * PURE arg resolver for searchSimilar's two call forms (kept testable without a binding):
 *   (query, topK?, filter?)            — no event
 *   (event, query, topK?, filter?)     — event-bound
 * The trailing `filter` is additive; existing callers (no filter) are unaffected.
 */
export function resolveSearchArgs(
  eventOrQuery: H3Event | string,
  queryOrTopK?: string | number,
  topKOrFilter?: number | VectorizeFilter,
  filterArg?: VectorizeFilter,
): ResolvedSearchArgs {
  if (typeof eventOrQuery === 'string') {
    return {
      query: eventOrQuery,
      topK: typeof queryOrTopK === 'number' ? queryOrTopK : 5,
      filter: isFilter(topKOrFilter) ? topKOrFilter : undefined,
    }
  }
  return {
    event: eventOrQuery,
    query: queryOrTopK as string,
    topK: typeof topKOrFilter === 'number' ? topKOrFilter : 5,
    filter: filterArg,
  }
}

/**
 * Search for similar vectors in the Vectorize index.
 * Returns empty results if the binding or embedding generation is unavailable.
 * Accepts (query, topK?, filter?) or (event, query, topK?, filter?). `filter` scopes by metadata
 * (e.g. per-user memory recall) and is passed through to vectorize.query when present.
 */
export async function searchSimilar(
  eventOrQuery: H3Event | string,
  queryOrTopK?: string | number,
  topKOrFilter?: number | VectorizeFilter,
  filterArg?: VectorizeFilter
): Promise<Array<{ id: string; score: number; metadata: Record<string, string> }>> {
  const { event, query, topK, filter } = resolveSearchArgs(eventOrQuery, queryOrTopK, topKOrFilter, filterArg)

  const vectorize = getVectorizeBinding(event)
  if (!vectorize) {
    return []
  }

  try {
    const queryEmbedding = await generateEmbedding(event || query, event ? query : undefined)
    if (queryEmbedding.length === 0) {
      return []
    }

    const queryOpts: Record<string, unknown> = { topK, returnMetadata: true }
    if (filter) queryOpts.filter = filter
    const result = await vectorize.query(queryEmbedding, queryOpts)

    if (!result?.matches) {
      return []
    }

    return result.matches.map((match: any) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata || {},
    }))
  } catch (err) {
    console.error('[aiVectorize] Similarity search failed:', err)
    return []
  }
}

/**
 * Delete a vector from the Vectorize index.
 * No-op if the binding is not available.
 * Accepts (id) or (event, id) for backward compatibility.
 */
export async function deleteVector(eventOrId: H3Event | string, idArg?: string): Promise<void> {
  let event: H3Event | undefined
  let id: string
  if (typeof eventOrId === 'string') {
    id = eventOrId
  } else {
    event = eventOrId
    id = idArg!
  }

  const vectorize = getVectorizeBinding(event)
  if (!vectorize) {
    return
  }

  try {
    await vectorize.deleteByIds([id])
  } catch (err) {
    console.error('[aiVectorize] Vector deletion failed:', err)
  }
}
