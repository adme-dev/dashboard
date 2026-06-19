import type { H3Event } from 'h3'
import { generateEmbedding, upsertVector } from '~~/server/utils/aiVectorize'
import type { MemScope, MemType } from './types'

/**
 * Write-side memory indexing (Phase-0 WS-A.8b, review finding #1). Without this, no memory vector is
 * ever written, so `searchSimilar({ userId })` can never match a memory and recall silently degrades
 * to the recency fallback — the WS-A.4 metadata filter does nothing. This embeds a memory's content
 * and upserts it to Vectorize keyed by the memory's OWN row id (so orchestrate's join — which fetches
 * `getMemoriesByIds(matches.map(m => m.id))` — resolves the matched vector ids back to the rows), with
 * `{ userId, scope, memType }` metadata so the per-user filter actually scopes recall.
 *
 * Deps are injected for unit-testing without bindings. Fail-safe: a missing binding or any error
 * yields `false` (recall just falls back to recency) — a memory write never breaks on indexing.
 */
export interface IndexMemoryDeps {
  embed: (event: H3Event | undefined, content: string) => Promise<number[]>
  upsert: (event: H3Event | undefined, id: string, values: number[], metadata: Record<string, string>) => Promise<void>
}

const defaultDeps: IndexMemoryDeps = {
  embed: (event, content) => event ? generateEmbedding(event, content) : generateEmbedding(content),
  upsert: (event, id, values, metadata) =>
    event ? upsertVector(event, id, values, metadata) : upsertVector(id, values, metadata),
}

export interface IndexMemoryInput {
  event?: H3Event
  id: string
  userId: string
  scope: MemScope
  memType: MemType
  content: string
}

export async function indexMemoryVector(input: IndexMemoryInput, deps: IndexMemoryDeps = defaultDeps): Promise<boolean> {
  const { event, id, userId, scope, memType, content } = input
  if (!id || !userId || !content?.trim()) return false
  try {
    const values = await deps.embed(event, content)
    if (!values || values.length === 0) return false // no binding / empty embedding → recency fallback covers it
    await deps.upsert(event, id, values, { userId, scope, memType })
    return true
  } catch {
    return false
  }
}
