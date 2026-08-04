import type { H3Event } from 'h3'
import { queryRows } from '~~/server/utils/db'
import {
  BoardKnowledgeVectorizeUnavailableError,
  generateKnowledgeEmbedding,
  queryKnowledgeVectorMatches,
  type KnowledgeVectorMatch
} from './vectorize'

const MAX_FILTER_BYTES = 1_900
const ACTIVE_BOARD_BOOST = 0.05
const MAX_SEARCH_LIMIT = 8
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface KnowledgeSearchRow {
  id: string
  article_id: string
  department_id: string | null
  scope_key: string
  title: string
  content: string
  source_file_name: string | null
  board_name: string | null
  page_start: number | null
  page_end: number | null
  sheet_name: string | null
  slide_number: number | null
}

export interface BoardKnowledgeSearchItem {
  id: string
  articleId: string
  boardId: string | null
  scopeKey: string
  title: string
  snippet: string
  score: number
  sourceFileName: string | null
  boardName: string | null
  pageStart: number | null
  pageEnd: number | null
  sheetName: string | null
  slideNumber: number | null
  url: string
}

export interface BoardKnowledgeSearchResult {
  items: BoardKnowledgeSearchItem[]
  unavailable?: true
}

export interface BoardKnowledgeSearchOptions {
  event?: H3Event
  departmentIds: string[]
  activeBoardId?: string
  limit?: number
}

export interface BoardKnowledgeSearchDeps {
  generateEmbedding: (query: string) => Promise<number[]>
  queryVectors: (
    values: number[],
    input: { scopeKeys: string[], topK: number }
  ) => Promise<KnowledgeVectorMatch[]>
  fetchRows: (chunkIds: string[], departmentIds: string[]) => Promise<KnowledgeSearchRow[]>
}

function filterSize(scopeKeys: string[]): number {
  return new TextEncoder().encode(JSON.stringify({ scopeKey: { $in: scopeKeys } })).byteLength
}

export function batchKnowledgeScopeKeys(scopeKeys: string[]): string[][] {
  const batches: string[][] = []
  let current: string[] = []
  for (const scopeKey of [...new Set(scopeKeys)]) {
    const candidate = [...current, scopeKey]
    if (current.length && filterSize(candidate) >= MAX_FILTER_BYTES) {
      batches.push(current)
      current = [scopeKey]
    } else {
      current = candidate
    }
  }
  if (current.length) batches.push(current)
  return batches
}

function compactSnippet(content: string): string {
  const value = content.replace(/\s+/g, ' ').trim()
  return value.length > 500 ? `${value.slice(0, 500)}…` : value
}

function defaultFetchRows(chunkIds: string[], departmentIds: string[]): Promise<KnowledgeSearchRow[]> {
  return queryRows<KnowledgeSearchRow>(`
    SELECT
      c.id,
      c.article_id,
      c.department_id,
      c.scope_key,
      a.title,
      c.content,
      s.source_file_name,
      d.name AS board_name,
      c.page_start,
      c.page_end,
      c.sheet_name,
      c.slide_number
    FROM ai_knowledge_chunks c
    JOIN ai_knowledge_articles a ON a.id = c.article_id
    LEFT JOIN board_knowledge_submissions s ON s.id = c.submission_id
    LEFT JOIN departments d ON d.id = c.department_id
    WHERE c.id = ANY($1::uuid[])
      AND a.is_published = true
      AND a.review_status = 'approved'
      AND (
        (
          c.scope_key = 'agency'
          AND c.submission_id IS NULL
          AND c.department_id IS NULL
          AND a.board_knowledge_submission_id IS NULL
        )
        OR (
          c.department_id = ANY($2::uuid[])
          AND c.scope_key = 'board:' || c.department_id::text
          AND s.id = c.submission_id
          AND s.review_status = 'approved'
          AND s.extraction_status = 'ready'
          AND s.index_status = 'indexed'
          AND s.source_deleted_at IS NULL
          AND s.ai_knowledge_article_id = c.article_id
        )
      )
  `, [chunkIds, departmentIds])
}

function defaultDeps(options: BoardKnowledgeSearchOptions): BoardKnowledgeSearchDeps {
  const context = { event: options.event }
  return {
    generateEmbedding: query => generateKnowledgeEmbedding(context, query),
    queryVectors: (values, input) => queryKnowledgeVectorMatches(context, { values, ...input }),
    fetchRows: defaultFetchRows
  }
}

export async function searchBoardKnowledge(
  query: string,
  options: BoardKnowledgeSearchOptions,
  dependencies?: BoardKnowledgeSearchDeps
): Promise<BoardKnowledgeSearchResult> {
  const value = query.trim()
  if (!value) return { items: [] }

  const departmentIds = [...new Set(options.departmentIds.filter(id => UUID_PATTERN.test(id)))]
  const accessible = new Set(departmentIds)
  const activeBoardId = options.activeBoardId && accessible.has(options.activeBoardId)
    ? options.activeBoardId
    : undefined
  const limit = Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.trunc(options.limit ?? 5)))
  const deps = dependencies ?? defaultDeps(options)
  const allScopes = ['agency', ...departmentIds.map(id => `board:${id}`)]

  let matches: KnowledgeVectorMatch[]
  try {
    const values = await deps.generateEmbedding(value)
    const topK = Math.min(100, Math.max(12, limit * 3))
    const queries = batchKnowledgeScopeKeys(allScopes).map(scopeKeys => (
      deps.queryVectors(values, { scopeKeys, topK })
    ))
    if (activeBoardId) {
      queries.push(deps.queryVectors(values, {
        scopeKeys: [`board:${activeBoardId}`],
        topK: Math.min(12, Math.max(4, limit))
      }))
    }
    matches = (await Promise.all(queries)).flat()
  } catch (error) {
    if (error instanceof BoardKnowledgeVectorizeUnavailableError || /binding is not configured/i.test(String(error))) {
      return { items: [], unavailable: true }
    }
    throw error
  }

  const scoreByChunkId = new Map<string, number>()
  for (const match of matches) {
    const chunkId = match.metadata?.chunkId
    if (!chunkId || !UUID_PATTERN.test(chunkId)) continue
    const score = Number(match.score)
    if (!Number.isFinite(score)) continue
    scoreByChunkId.set(chunkId, Math.max(scoreByChunkId.get(chunkId) ?? -Infinity, score))
  }
  if (!scoreByChunkId.size) return { items: [] }

  const rows = await deps.fetchRows([...scoreByChunkId.keys()], departmentIds)
  const items = rows.flatMap((row): BoardKnowledgeSearchItem[] => {
    const score = scoreByChunkId.get(row.id)
    if (score === undefined) return []
    const isAgency = row.scope_key === 'agency' && row.department_id === null
    const isAccessibleBoard = Boolean(
      row.department_id
      && accessible.has(row.department_id)
      && row.scope_key === `board:${row.department_id}`
    )
    if (!isAgency && !isAccessibleBoard) return []
    const boostedScore = row.department_id === activeBoardId
      ? Math.min(1, score + ACTIVE_BOARD_BOOST)
      : score
    return [{
      id: row.id,
      articleId: row.article_id,
      boardId: row.department_id,
      scopeKey: row.scope_key,
      title: row.title,
      snippet: compactSnippet(row.content),
      score: boostedScore,
      sourceFileName: row.source_file_name,
      boardName: row.board_name,
      pageStart: row.page_start,
      pageEnd: row.page_end,
      sheetName: row.sheet_name,
      slideNumber: row.slide_number,
      url: row.department_id ? `/agency/boards/${row.department_id}` : '/agency/ai/knowledge'
    }]
  })

  return {
    items: items
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
  }
}
