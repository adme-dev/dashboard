import type { H3Event } from 'h3'
import { getCachedObjectBinding } from '~~/server/utils/email'

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
const EMBEDDING_DIMENSIONS = 768
const MAX_KNOWLEDGE_CHUNK_CHARACTERS = 2_200
const MAX_VECTOR_BATCH = 100
const MAX_QUERY_RESULTS = 100

interface WorkersAiBinding {
  run: (model: string, input: { text: string[] }) => Promise<{
    data?: Array<number[] | Float32Array>
  }>
}

export interface KnowledgeVectorMetadata {
  type: 'knowledge_chunk'
  scopeKey: string
  chunkId: string
  submissionId: string
  articleId: string
  contentHash: string
  chunkIndex: number
  departmentId?: string
  section?: string
  pageStart?: number
  sheetName?: string
  slideNumber?: number
}

interface VectorizeBinding {
  upsert: (vectors: Array<{
    id: string
    values: number[]
    metadata: KnowledgeVectorMetadata
  }>) => Promise<unknown>
  query: (values: number[], options: {
    topK: number
    returnMetadata: 'all'
    returnValues: false
    filter: { scopeKey: { $in: string[] } }
  }) => Promise<{
    matches?: Array<{
      id: string
      score: number
      metadata?: Partial<KnowledgeVectorMetadata>
    }>
  }>
  deleteByIds: (ids: string[]) => Promise<unknown>
}

export interface BoardKnowledgeVectorizeContext {
  event?: H3Event
}

export interface KnowledgeVectorChunkInput {
  scopeKey: string
  chunkId: string
  submissionId: string
  articleId: string
  contentHash: string
  chunkIndex: number
  departmentId?: string
  heading?: string | null
  pageStart?: number | null
  sheetName?: string | null
  slideNumber?: number | null
  content: string
}

export interface KnowledgeVectorWriteResult {
  chunkId: string
  vectorId: string
}

export interface KnowledgeVectorMatch {
  id: string
  score: number
  metadata?: Partial<KnowledgeVectorMetadata>
}

export class BoardKnowledgeVectorizeUnavailableError extends Error {
  constructor(readonly binding: 'AI' | 'KNOWLEDGE_VECTORIZE') {
    super(`${binding} binding is not configured`)
    this.name = 'BoardKnowledgeVectorizeUnavailableError'
  }
}

function eventBinding<T>(context: BoardKnowledgeVectorizeContext, name: 'AI' | 'KNOWLEDGE_VECTORIZE'): T | undefined {
  const env = (context.event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)
    ?.cloudflare?.env
  const value = env?.[name]
  if (value && typeof value === 'object') return value as T
  return getCachedObjectBinding<T>(name)
}

function requireBinding<T>(context: BoardKnowledgeVectorizeContext, name: 'AI' | 'KNOWLEDGE_VECTORIZE'): T {
  const binding = eventBinding<T>(context, name)
  if (!binding) throw new BoardKnowledgeVectorizeUnavailableError(name)
  return binding
}

function requireText(text: string): string {
  const value = text.trim()
  if (!value) throw new Error('Knowledge embedding text is required')
  if (value.length > MAX_KNOWLEDGE_CHUNK_CHARACTERS) {
    throw new Error('Knowledge embedding text exceeds the chunk contract')
  }
  return value
}

function requireScopeKeys(scopeKeys: string[]): string[] {
  const unique = [...new Set(scopeKeys.map(value => value.trim()).filter(Boolean))]
  if (!unique.length) throw new Error('At least one knowledge scope is required')
  return unique
}

export function knowledgeVectorId(chunkId: string, contentHash: string): string {
  if (!chunkId.trim() || !contentHash.trim()) throw new Error('Knowledge vector identity is incomplete')
  return `k:${chunkId}:${contentHash.slice(0, 16)}`
}

export async function generateKnowledgeEmbedding(
  context: BoardKnowledgeVectorizeContext,
  text: string
): Promise<number[]> {
  return (await generateKnowledgeEmbeddings(context, [text]))[0]!
}

async function generateKnowledgeEmbeddings(
  context: BoardKnowledgeVectorizeContext,
  texts: string[]
): Promise<number[][]> {
  const ai = requireBinding<WorkersAiBinding>(context, 'AI')
  const response = await ai.run(EMBEDDING_MODEL, { text: texts.map(requireText) })
  const values = (response.data || []).map(embedding => Array.from(embedding))
  if (values.length !== texts.length || values.some(embedding => (
    embedding.length !== EMBEDDING_DIMENSIONS || embedding.some(value => !Number.isFinite(value))
  ))) {
    throw new Error(`Workers AI returned an invalid ${EMBEDDING_MODEL} embedding`)
  }
  return values
}

export async function upsertKnowledgeChunks(
  context: BoardKnowledgeVectorizeContext,
  chunks: KnowledgeVectorChunkInput[]
): Promise<KnowledgeVectorWriteResult[]> {
  if (!chunks.length) return []
  if (chunks.length > MAX_VECTOR_BATCH) throw new Error(`Knowledge vector batch exceeds ${MAX_VECTOR_BATCH}`)
  const index = requireBinding<VectorizeBinding>(context, 'KNOWLEDGE_VECTORIZE')
  const embeddings = await generateKnowledgeEmbeddings(context, chunks.map(chunk => chunk.content))
  const vectors = chunks.map((chunk, chunkOffset) => ({
    id: knowledgeVectorId(chunk.chunkId, chunk.contentHash),
    values: embeddings[chunkOffset]!,
    metadata: {
      type: 'knowledge_chunk' as const,
      scopeKey: chunk.scopeKey,
      chunkId: chunk.chunkId,
      submissionId: chunk.submissionId,
      articleId: chunk.articleId,
      contentHash: chunk.contentHash,
      chunkIndex: chunk.chunkIndex,
      ...(chunk.departmentId ? { departmentId: chunk.departmentId } : {}),
      ...(chunk.heading ? { section: chunk.heading.slice(0, 160) } : {}),
      ...(chunk.pageStart ? { pageStart: chunk.pageStart } : {}),
      ...(chunk.sheetName ? { sheetName: chunk.sheetName.slice(0, 100) } : {}),
      ...(chunk.slideNumber ? { slideNumber: chunk.slideNumber } : {})
    }
  }))
  await index.upsert(vectors)
  return vectors.map(vector => ({
    chunkId: vector.metadata.chunkId,
    vectorId: vector.id
  }))
}

export async function deleteKnowledgeVectors(
  context: BoardKnowledgeVectorizeContext,
  storedVectorIds: Array<string | null | undefined>
): Promise<number> {
  const ids = [...new Set(storedVectorIds.filter((id): id is string => Boolean(id?.trim())))]
  if (!ids.length) return 0
  const index = requireBinding<VectorizeBinding>(context, 'KNOWLEDGE_VECTORIZE')
  for (let offset = 0; offset < ids.length; offset += MAX_VECTOR_BATCH) {
    await index.deleteByIds(ids.slice(offset, offset + MAX_VECTOR_BATCH))
  }
  return ids.length
}

export async function queryKnowledgeVectors(
  context: BoardKnowledgeVectorizeContext,
  input: { query: string, scopeKeys: string[], topK?: number }
): Promise<KnowledgeVectorMatch[]> {
  const scopeKeys = requireScopeKeys(input.scopeKeys)
  const topK = Math.max(1, Math.min(MAX_QUERY_RESULTS, Math.trunc(input.topK ?? 12)))
  const index = requireBinding<VectorizeBinding>(context, 'KNOWLEDGE_VECTORIZE')
  const values = await generateKnowledgeEmbedding(context, input.query)
  const response = await index.query(values, {
    topK,
    returnMetadata: 'all',
    returnValues: false,
    filter: { scopeKey: { $in: scopeKeys } }
  })
  return response.matches || []
}
