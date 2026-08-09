import type { H3Event } from 'h3'
import type { SiteIntelligenceLane, SiteIntelligencePageType } from '~~/app/types/site-intelligence'
import { execute, queryRows } from '~~/server/utils/db'

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
const EMBEDDING_DIMENSIONS = 768
const MAX_EMBEDDING_TEXT = 2000

interface WorkersAiBinding {
  run: (model: string, input: { text: string[] }) => Promise<{ data?: number[][] | Float32Array[] }>
}

interface VectorizeBinding {
  upsert: (vectors: Array<{ id: string, values: number[], metadata: Record<string, string> }>) => Promise<unknown>
  query: (values: number[], options: Record<string, unknown>) => Promise<{
    matches?: Array<{ id: string, score: number, metadata?: Record<string, string> }>
  }>
  deleteByIds: (ids: string[]) => Promise<unknown>
}

export interface SiteIntelligenceVectorInput {
  clientId: string
  domainId: string
  pageId: string
  lane: SiteIntelligenceLane
  pageType: SiteIntelligencePageType
  contentHash: string
  text: string
}

export interface SiteIntelligenceSearchResult {
  pageId: string
  score: number
  sourceUrl: string
  pageType: SiteIntelligencePageType
  excerpt: string
}

export async function upsertSiteIntelligencePageVector(
  input: SiteIntelligenceVectorInput,
  event: H3Event
): Promise<void> {
  requireIdentifier(input.clientId, 'clientId')
  requireIdentifier(input.domainId, 'domainId')
  requireIdentifier(input.pageId, 'pageId')
  const ai = requireBinding<WorkersAiBinding>(event, 'AI')
  const index = requireBinding<VectorizeBinding>(event, 'SITE_INTELLIGENCE_VECTORIZE')
  const values = await embed(ai, input.text)
  await index.upsert([{
    id: input.pageId,
    values,
    metadata: {
      clientId: input.clientId,
      domainId: input.domainId,
      lane: input.lane,
      pageType: input.pageType
    }
  }])
  const updated = await execute(`UPDATE site_intelligence_pages
    SET vector_id = $3
    WHERE id = $1 AND client_id = $2 AND content_hash = $4`,
  [input.pageId, input.clientId, input.pageId, input.contentHash])
  if (updated === 0) await index.deleteByIds([input.pageId])
}

export async function searchSiteIntelligence(input: {
  clientId: string
  query: string
  limit?: number
}, event: H3Event): Promise<SiteIntelligenceSearchResult[]> {
  requireIdentifier(input.clientId, 'clientId')
  const queryText = input.query.trim()
  if (!queryText) throw new Error('query is required')
  const limit = Math.max(1, Math.min(20, Math.trunc(input.limit ?? 5)))
  const ai = requireBinding<WorkersAiBinding>(event, 'AI')
  const index = requireBinding<VectorizeBinding>(event, 'SITE_INTELLIGENCE_VECTORIZE')
  const values = await embed(ai, queryText)
  const matches = (await index.query(values, {
    topK: limit,
    returnMetadata: 'all',
    returnValues: false,
    filter: { clientId: input.clientId }
  })).matches ?? []
  if (!matches.length) return []

  const ids = matches.map(match => match.id)
  const rows = await queryRows<{
    id: string
    source_url: string
    facts: { pageType?: SiteIntelligencePageType }
    ai_enrichment: { summary?: string }
  }>(`SELECT id, source_url, facts, ai_enrichment
    FROM site_intelligence_pages
    WHERE client_id = $1 AND id = ANY($2::uuid[])`, [input.clientId, ids])
  const byId = new Map(rows.map(row => [row.id, row]))
  return matches.flatMap((match) => {
    const row = byId.get(match.id)
    if (!row) return []
    return [{
      pageId: row.id,
      score: match.score,
      sourceUrl: row.source_url,
      pageType: row.facts.pageType ?? 'other',
      excerpt: String(row.ai_enrichment.summary ?? '').slice(0, 500)
    }]
  })
}

export async function deleteSiteIntelligencePageVector(input: {
  clientId: string
  pageId: string
}, event: H3Event): Promise<void> {
  requireIdentifier(input.clientId, 'clientId')
  requireIdentifier(input.pageId, 'pageId')
  const index = requireBinding<VectorizeBinding>(event, 'SITE_INTELLIGENCE_VECTORIZE')
  await index.deleteByIds([input.pageId])
  await execute(`UPDATE site_intelligence_pages
    SET vector_id = NULL
    WHERE id = $1 AND client_id = $2`, [input.pageId, input.clientId])
}

async function embed(ai: WorkersAiBinding, text: string): Promise<number[]> {
  const value = text.trim().slice(0, MAX_EMBEDDING_TEXT)
  if (!value) throw new Error('Embedding text is required')
  const response = await ai.run(EMBEDDING_MODEL, { text: [value] })
  const values = response.data?.[0] ? Array.from(response.data[0]) : []
  if (values.length !== EMBEDDING_DIMENSIONS || values.some(item => !Number.isFinite(item))) {
    throw new Error(`Workers AI returned an invalid ${EMBEDDING_MODEL} embedding`)
  }
  return values
}

function requireBinding<T>(event: H3Event, name: string): T {
  const binding = (event?.context as {
    cloudflare?: { env?: Record<string, unknown> }
  } | undefined)?.cloudflare?.env?.[name]
  if (!binding) throw new Error(`${name} binding is not configured`)
  return binding as T
}

function requireIdentifier(value: string, name: string): void {
  if (!value?.trim()) throw new Error(`${name} is required`)
}
