import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { buildKnowledgeChunks } from '../server/utils/boardKnowledge/chunking'

const DEFAULT_ARTICLE_BATCH_SIZE = 25
const MAX_ARTICLE_BATCH_SIZE = 100
const DEFAULT_VECTOR_BATCH_SIZE = 50
const MAX_VECTOR_BATCH_SIZE = 100
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
const VECTORIZE_INDEX = 'agency-knowledge'

export interface AgencyKnowledgeArticle {
  id: string
  title: string
  content: string
  updatedAt: string
}

export interface AgencyKnowledgeChunk {
  id: string
  articleId: string
  submissionId: null
  departmentId: null
  scopeKey: 'agency'
  chunkIndex: number
  content: string
  contentHash: string
  heading: string | null
  pageStart: null
  pageEnd: null
  sheetName: null
  slideNumber: null
  tokenEstimate: number
  vectorId: string | null
}

interface BackfillVectorWrite {
  chunkId: string
  vectorId: string
}

export interface BoardKnowledgeBackfillDependencies {
  listArticles: (afterId: string | null, limit: number) => Promise<AgencyKnowledgeArticle[]>
  loadChunks: (articleId: string) => Promise<AgencyKnowledgeChunk[]>
  prepareChunks: (article: AgencyKnowledgeArticle, chunks: AgencyKnowledgeChunk[]) => Promise<{
    chunks: AgencyKnowledgeChunk[]
    staleVectorIds: string[]
  }>
  upsertChunks: (context: Record<string, never>, chunks: AgencyKnowledgeChunk[]) => Promise<BackfillVectorWrite[]>
  deleteVectors: (context: Record<string, never>, ids: string[]) => Promise<number>
  persistVectors: (articleId: string, vectors: BackfillVectorWrite[]) => Promise<{
    expected: number
    indexed: number
  }>
}

export interface BoardKnowledgeBackfillOptions {
  acknowledged: boolean
  dryRun: boolean
  articleBatchSize?: number
  vectorBatchSize?: number
}

export interface BoardKnowledgeBackfillReport {
  dryRun: boolean
  articlesScanned: number
  planned: number
  skipped: number
  indexed: number
  chunksExpected: number
  chunksIndexed: number
  parity: boolean
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function buildAgencyKnowledgeChunks(article: AgencyKnowledgeArticle): AgencyKnowledgeChunk[] {
  const drafts = buildKnowledgeChunks({
    outcome: 'usable',
    method: 'native',
    blocks: [{
      kind: 'text',
      content: article.content,
      heading: article.title,
      pageStart: undefined,
      pageEnd: undefined,
      sheetName: undefined,
      slideNumber: undefined
    }],
    metrics: {
      characters: article.content.length,
      blankRatio: 0,
      replacementRatio: 0
    },
    warnings: [],
    errorCode: null
  })
  return drafts.map(draft => ({
    id: deterministicUuid(`agency-knowledge:${article.id}:${draft.chunkIndex}`),
    articleId: article.id,
    submissionId: null,
    departmentId: null,
    scopeKey: 'agency',
    chunkIndex: draft.chunkIndex,
    content: draft.content,
    contentHash: draft.contentHash,
    heading: article.title,
    pageStart: null,
    pageEnd: null,
    sheetName: null,
    slideNumber: null,
    tokenEstimate: draft.tokenEstimate,
    vectorId: null
  }))
}

function clampBatch(value: number | undefined, fallback: number, maximum: number): number {
  return Math.max(1, Math.min(maximum, Math.trunc(value ?? fallback)))
}

function matchingIndexedChunks(existing: AgencyKnowledgeChunk[], expected: AgencyKnowledgeChunk[]): boolean {
  if (existing.length !== expected.length || existing.some(chunk => !chunk.vectorId)) return false
  const byIndex = new Map(existing.map(chunk => [chunk.chunkIndex, chunk]))
  return expected.every(chunk => byIndex.get(chunk.chunkIndex)?.contentHash === chunk.contentHash)
}

export async function runBoardKnowledgeBackfill(
  options: BoardKnowledgeBackfillOptions,
  dependencies: BoardKnowledgeBackfillDependencies
): Promise<BoardKnowledgeBackfillReport> {
  if (!options.acknowledged) {
    throw new Error('Refusing to run: BOARD_KNOWLEDGE_BACKFILL_ACK=true is required')
  }
  const articleBatchSize = clampBatch(options.articleBatchSize, DEFAULT_ARTICLE_BATCH_SIZE, MAX_ARTICLE_BATCH_SIZE)
  const vectorBatchSize = clampBatch(options.vectorBatchSize, DEFAULT_VECTOR_BATCH_SIZE, MAX_VECTOR_BATCH_SIZE)
  const report: BoardKnowledgeBackfillReport = {
    dryRun: options.dryRun,
    articlesScanned: 0,
    planned: 0,
    skipped: 0,
    indexed: 0,
    chunksExpected: 0,
    chunksIndexed: 0,
    parity: true
  }
  let afterId: string | null = null

  while (true) {
    const articles = await dependencies.listArticles(afterId, articleBatchSize)
    if (!articles.length) break
    for (const article of articles) {
      report.articlesScanned += 1
      const expected = buildAgencyKnowledgeChunks(article)
      if (!expected.length) throw new Error(`Agency knowledge article ${article.id} produced no chunks`)
      const existing = await dependencies.loadChunks(article.id)
      if (matchingIndexedChunks(existing, expected)) {
        report.skipped += 1
        continue
      }

      report.planned += 1
      report.chunksExpected += expected.length
      if (options.dryRun) continue

      const staleVectorIds = existing.map(chunk => chunk.vectorId).filter((id): id is string => Boolean(id))
      if (staleVectorIds.length) await dependencies.deleteVectors({}, staleVectorIds)
      const prepared = await dependencies.prepareChunks(article, expected)
      const alreadyDeleted = new Set(staleVectorIds)
      const additionalStaleVectorIds = prepared.staleVectorIds.filter(id => !alreadyDeleted.has(id))
      if (additionalStaleVectorIds.length) await dependencies.deleteVectors({}, additionalStaleVectorIds)

      const vectors: BackfillVectorWrite[] = []
      for (let offset = 0; offset < prepared.chunks.length; offset += vectorBatchSize) {
        vectors.push(...await dependencies.upsertChunks({}, prepared.chunks.slice(offset, offset + vectorBatchSize)))
      }
      const uniqueVectorIds = new Set(vectors.map(vector => vector.chunkId))
      if (vectors.length !== prepared.chunks.length || uniqueVectorIds.size !== prepared.chunks.length) {
        throw new Error('agency_knowledge_vector_parity_failed')
      }
      const parity = await dependencies.persistVectors(article.id, vectors)
      if (parity.expected !== prepared.chunks.length || parity.indexed !== prepared.chunks.length) {
        throw new Error('agency_knowledge_vector_parity_failed')
      }
      report.indexed += 1
      report.chunksIndexed += parity.indexed
    }
    afterId = articles.at(-1)!.id
    if (articles.length < articleBatchSize) break
  }
  report.parity = options.dryRun || report.chunksExpected === report.chunksIndexed
  return report
}

interface AgencyChunkRow {
  id: string
  article_id: string
  chunk_index: number
  content: string
  content_hash: string
  heading: string | null
  token_estimate: number | null
  vector_id: string | null
}

function mapAgencyChunk(row: AgencyChunkRow): AgencyKnowledgeChunk {
  return {
    id: row.id,
    articleId: row.article_id,
    submissionId: null,
    departmentId: null,
    scopeKey: 'agency',
    chunkIndex: row.chunk_index,
    content: row.content,
    contentHash: row.content_hash,
    heading: row.heading,
    pageStart: null,
    pageEnd: null,
    sheetName: null,
    slideNumber: null,
    tokenEstimate: row.token_estimate || Math.ceil(row.content.length / 4),
    vectorId: row.vector_id
  }
}

async function createDatabaseDependencies(): Promise<Omit<BoardKnowledgeBackfillDependencies, 'upsertChunks' | 'deleteVectors'>> {
  const { queryRows, transaction } = await import('../server/utils/db')
  return {
    async listArticles(afterId, limit) {
      const rows = await queryRows<{
        id: string
        title: string
        content: string
        updated_at: string | Date
      }>(`
        SELECT id, title, content, updated_at
        FROM ai_knowledge_articles
        WHERE is_published = true
          AND review_status = 'approved'
          AND board_knowledge_submission_id IS NULL
          AND ($1::uuid IS NULL OR id > $1::uuid)
        ORDER BY id
        LIMIT $2
      `, [afterId, limit])
      return rows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
      }))
    },
    async loadChunks(articleId) {
      const rows = await queryRows<AgencyChunkRow>(`
        SELECT id, article_id, chunk_index, content, content_hash, heading,
          token_estimate, vector_id
        FROM ai_knowledge_chunks
        WHERE article_id = $1 AND scope_key = 'agency'
        ORDER BY chunk_index
      `, [articleId])
      return rows.map(mapAgencyChunk)
    },
    async prepareChunks(article, chunks) {
      return transaction(async (client) => {
        await client.query('SELECT id FROM ai_knowledge_articles WHERE id = $1 FOR UPDATE', [article.id])
        const previous = await client.query(`
          SELECT vector_id
          FROM ai_knowledge_chunks
          WHERE article_id = $1 AND scope_key = 'agency' AND vector_id IS NOT NULL
        `, [article.id])
        const staleVectorIds = (previous.rows || [])
          .map(row => (row as { vector_id: string | null }).vector_id)
          .filter((id): id is string => Boolean(id))
        await client.query(`DELETE FROM ai_knowledge_chunks WHERE article_id = $1 AND scope_key = 'agency'`, [article.id])
        await client.query(`
          INSERT INTO ai_knowledge_chunks (
            id, article_id, submission_id, department_id, scope_key, chunk_index,
            content, heading, content_hash, token_estimate, vector_id
          )
          SELECT id, $1, NULL, NULL, 'agency', chunk_index, content, heading,
            content_hash, token_estimate, NULL
          FROM jsonb_to_recordset($2::jsonb) AS chunk(
            id UUID,
            chunk_index INTEGER,
            content TEXT,
            heading TEXT,
            content_hash TEXT,
            token_estimate INTEGER
          )
          ORDER BY chunk_index
        `, [article.id, JSON.stringify(chunks.map(chunk => ({
          id: chunk.id,
          chunk_index: chunk.chunkIndex,
          content: chunk.content,
          heading: chunk.heading,
          content_hash: chunk.contentHash,
          token_estimate: chunk.tokenEstimate
        })))])
        return { chunks, staleVectorIds }
      })
    },
    async persistVectors(articleId, vectors) {
      return transaction(async (client) => {
        await client.query(`
          UPDATE ai_knowledge_chunks chunk
          SET vector_id = vector.vector_id, updated_at = NOW()
          FROM jsonb_to_recordset($2::jsonb) AS vector(chunk_id UUID, vector_id TEXT)
          WHERE chunk.article_id = $1
            AND chunk.scope_key = 'agency'
            AND chunk.id = vector.chunk_id
        `, [articleId, JSON.stringify(vectors.map(vector => ({
          chunk_id: vector.chunkId,
          vector_id: vector.vectorId
        })))])
        const result = await client.query(`
          SELECT COUNT(*)::integer AS expected, COUNT(vector_id)::integer AS indexed
          FROM ai_knowledge_chunks
          WHERE article_id = $1 AND scope_key = 'agency'
        `, [articleId])
        const row = result.rows?.[0] as { expected: number, indexed: number } | undefined
        return { expected: Number(row?.expected || 0), indexed: Number(row?.indexed || 0) }
      })
    }
  }
}

interface CloudflareRestConfig {
  accountId: string
  apiToken: string
}

function cloudflareConfig(): CloudflareRestConfig {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || ''
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || ''
  if (!accountId || !apiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for a live backfill')
  }
  return { accountId, apiToken }
}

async function cloudflareJson(config: CloudflareRestConfig, path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      ...init.headers
    }
  })
  const result = await response.json().catch(() => null) as { success?: boolean, errors?: Array<{ message?: string }> } | null
  if (!response.ok || result?.success === false) {
    throw new Error(result?.errors?.[0]?.message || `Cloudflare API request failed (${response.status})`)
  }
  return result
}

async function createCloudflareDependencies(): Promise<Pick<BoardKnowledgeBackfillDependencies, 'upsertChunks' | 'deleteVectors'>> {
  const config = cloudflareConfig()
  return {
    async upsertChunks(_context, chunks) {
      const embeddingResult = await cloudflareJson(config, `/ai/run/${EMBEDDING_MODEL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunks.map(chunk => chunk.content) })
      }) as { result?: { data?: number[][] } }
      const embeddings = embeddingResult.result?.data || []
      if (embeddings.length !== chunks.length || embeddings.some(values => values.length !== 768)) {
        throw new Error('Workers AI returned incomplete agency knowledge embeddings')
      }
      const vectors = chunks.map((chunk, index) => ({
        id: `k:${chunk.id}:${chunk.contentHash.slice(0, 16)}`,
        values: embeddings[index],
        metadata: {
          type: 'knowledge_chunk',
          articleId: chunk.articleId,
          chunkId: chunk.id,
          scopeKey: 'agency',
          contentHash: chunk.contentHash,
          chunkIndex: chunk.chunkIndex,
          section: chunk.heading?.slice(0, 160) || ''
        }
      }))
      const form = new FormData()
      form.set('vectors', new Blob([vectors.map(vector => JSON.stringify(vector)).join('\n')], { type: 'application/x-ndjson' }), 'vectors.ndjson')
      await cloudflareJson(config, `/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`, {
        method: 'POST',
        body: form
      })
      return chunks.map((chunk, index) => ({ chunkId: chunk.id, vectorId: vectors[index]!.id }))
    },
    async deleteVectors(_context, ids) {
      if (!ids.length) return 0
      await cloudflareJson(config, `/vectorize/v2/indexes/${VECTORIZE_INDEX}/delete_by_ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      })
      return ids.length
    }
  }
}

async function main(): Promise<void> {
  const acknowledged = process.env.BOARD_KNOWLEDGE_BACKFILL_ACK === 'true'
  const dryRun = process.argv.includes('--dry-run')
  if (!acknowledged) throw new Error('Refusing to run: BOARD_KNOWLEDGE_BACKFILL_ACK=true is required')
  const database = await createDatabaseDependencies()
  const cloudflare = dryRun
    ? {
        upsertChunks: async () => [],
        deleteVectors: async () => 0
      }
    : await createCloudflareDependencies()
  const report = await runBoardKnowledgeBackfill({ acknowledged, dryRun }, { ...database, ...cloudflare })
  console.log(JSON.stringify(report, null, 2))
  if (!report.parity) process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`[board-knowledge-backfill] ${error instanceof Error ? error.message : 'Backfill failed'}`)
    process.exitCode = 1
  })
}
