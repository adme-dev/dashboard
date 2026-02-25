import type { H3Event } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { classifyIntent, type AiIntent } from '~~/server/utils/aiIntentClassifier'
import { searchSimilar } from '~~/server/utils/aiVectorize'

export interface ContextItem {
  type: string
  id: string
  title: string
  snippet: string
  url: string
  relevanceScore?: number
  updatedAt?: string
  semanticScore?: number
}

export interface ContextBundle {
  items: ContextItem[]
  tokenEstimate: number
  intent: AiIntent
  intentConfidence: number
  entities: string[]
}

// Simple keyword extraction from user question
function extractKeywords(question: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
    'through', 'after', 'before', 'during', 'above', 'below', 'up', 'down',
    'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
    'only', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but',
    'and', 'or', 'if', 'while', 'what', 'which', 'who', 'whom', 'this',
    'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
    'any', 'many', 'much', 'tell', 'show', 'give', 'get', 'let', 'know',
  ])

  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
}

// Map AiIntent to retriever data source categories
const INTENT_TO_SOURCES: Record<AiIntent, string[]> = {
  task_query: ['tasks', 'boards'],
  brief_query: ['briefs', 'clients'],
  project_query: ['boards', 'tasks'],
  financial_query: ['financial'],
  team_query: ['team'],
  process_query: ['knowledge'],
  search: ['tasks', 'clients', 'briefs'],
  action_request: ['tasks', 'boards'],
  general: ['tasks', 'clients'],
}

// --- Composite Scoring Configuration ---

interface ScoringProfile {
  semantic: number
  recency: number
  importance: number
  intent: number
  entity: number
  recencyHalfLifeDays: number
}

const SCORING_PROFILES: Record<AiIntent, ScoringProfile> = {
  task_query:      { semantic: 0.25, recency: 0.25, importance: 0.15, intent: 0.20, entity: 0.15, recencyHalfLifeDays: 30 },
  brief_query:     { semantic: 0.25, recency: 0.20, importance: 0.15, intent: 0.20, entity: 0.20, recencyHalfLifeDays: 45 },
  project_query:   { semantic: 0.25, recency: 0.20, importance: 0.15, intent: 0.20, entity: 0.20, recencyHalfLifeDays: 30 },
  financial_query: { semantic: 0.20, recency: 0.30, importance: 0.15, intent: 0.20, entity: 0.15, recencyHalfLifeDays: 7 },
  team_query:      { semantic: 0.20, recency: 0.15, importance: 0.15, intent: 0.25, entity: 0.25, recencyHalfLifeDays: 60 },
  process_query:   { semantic: 0.35, recency: 0.10, importance: 0.20, intent: 0.20, entity: 0.15, recencyHalfLifeDays: 90 },
  search:          { semantic: 0.20, recency: 0.10, importance: 0.10, intent: 0.25, entity: 0.35, recencyHalfLifeDays: 30 },
  action_request:  { semantic: 0.20, recency: 0.25, importance: 0.15, intent: 0.25, entity: 0.15, recencyHalfLifeDays: 14 },
  general:         { semantic: 0.25, recency: 0.20, importance: 0.15, intent: 0.20, entity: 0.20, recencyHalfLifeDays: 30 },
}

const ENTITY_IMPORTANCE: Record<string, number> = {
  spend: 0.85,
  knowledge: 0.80,
  client: 0.75,
  task: 0.70,
  brief: 0.65,
  team: 0.60,
  board: 0.55,
}

// Estimate token count (rough: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

async function searchTasks(userId: string, keywords: string[]): Promise<ContextItem[]> {
  if (keywords.length === 0) {
    // Fallback: get user's recently assigned tasks
    const rows = await queryRows(`
      SELECT t.id, t.name, t.status, d.name as board_name,
             t.due_date, t.updated_at
      FROM tasks t
      JOIN departments d ON t.department_id = d.id
      WHERE t.assignee_id = $1
        AND t.parent_task_id IS NULL
      ORDER BY t.updated_at DESC
      LIMIT 5
    `, [userId])

    return rows.map(r => ({
      type: 'task',
      id: r.id,
      title: r.name,
      snippet: `Status: ${r.status} | Board: ${r.board_name}${r.due_date ? ` | Due: ${r.due_date}` : ''}`,
      url: `/agency/boards/${r.department_id}`,
      updatedAt: r.updated_at,
    }))
  }

  const pattern = keywords.join('|')
  const rows = await queryRows(`
    SELECT t.id, t.name, t.status, d.name as board_name,
           t.due_date, t.department_id, t.updated_at
    FROM tasks t
    JOIN departments d ON t.department_id = d.id
    WHERE t.parent_task_id IS NULL
      AND (
        t.name ~* $1
        OR t.description ~* $1
        OR t.assignee_id = $2
      )
    ORDER BY
      CASE WHEN t.assignee_id = $2 THEN 0 ELSE 1 END,
      t.updated_at DESC
    LIMIT 5
  `, [pattern, userId])

  return rows.map(r => ({
    type: 'task',
    id: r.id,
    title: r.name,
    snippet: `Status: ${r.status} | Board: ${r.board_name}${r.due_date ? ` | Due: ${r.due_date}` : ''}`,
    url: `/agency/boards/${r.department_id}`,
    updatedAt: r.updated_at,
  }))
}

async function searchBriefs(keywords: string[]): Promise<ContextItem[]> {
  const pattern = keywords.length > 0 ? keywords.join('|') : '.*'
  const rows = await queryRows(`
    SELECT b.id, b.title, b.status, c.name as client_name,
           b.created_at
    FROM briefs b
    LEFT JOIN agency_clients c ON b.client_id = c.id
    WHERE b.title ~* $1
       OR c.name ~* $1
    ORDER BY b.created_at DESC
    LIMIT 5
  `, [pattern])

  return rows.map(r => ({
    type: 'brief',
    id: r.id,
    title: r.title || 'Untitled Brief',
    snippet: `Client: ${r.client_name || 'Unknown'} | Status: ${r.status}`,
    url: `/agency/briefs/${r.id}`,
    updatedAt: r.created_at,
  }))
}

async function searchBoards(userId: string): Promise<ContextItem[]> {
  const rows = await queryRows(`
    SELECT d.id, d.name, d.description,
           COUNT(t.id) FILTER (WHERE t.parent_task_id IS NULL) as task_count,
           COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.parent_task_id IS NULL) as done_count,
           MAX(t.updated_at) as latest_activity
    FROM departments d
    LEFT JOIN tasks t ON t.department_id = d.id
    LEFT JOIN department_members dm ON dm.department_id = d.id AND dm.team_member_id = $1
    WHERE dm.team_member_id IS NOT NULL OR d.manager_id = $1
    GROUP BY d.id, d.name, d.description
    ORDER BY MAX(t.updated_at) DESC NULLS LAST
    LIMIT 5
  `, [userId])

  return rows.map(r => ({
    type: 'board',
    id: r.id,
    title: r.name,
    snippet: `${r.task_count} tasks (${r.done_count} done)${r.description ? ` — ${r.description.slice(0, 80)}` : ''}`,
    url: `/agency/boards/${r.id}`,
    updatedAt: r.latest_activity,
  }))
}

async function searchClients(keywords: string[]): Promise<ContextItem[]> {
  const pattern = keywords.length > 0 ? keywords.join('|') : '.*'
  const rows = await queryRows(`
    SELECT c.id, c.name, c.status, c.industry, c.created_at,
           COUNT(DISTINCT b.id) as brief_count
    FROM agency_clients c
    LEFT JOIN briefs b ON b.client_id = c.id
    WHERE c.name ~* $1
    GROUP BY c.id, c.name, c.status, c.industry, c.created_at
    ORDER BY c.name ASC
    LIMIT 5
  `, [pattern])

  return rows.map(r => ({
    type: 'client',
    id: r.id,
    title: r.name,
    snippet: `Status: ${r.status || 'active'}${r.industry ? ` | Industry: ${r.industry}` : ''} | ${r.brief_count} briefs`,
    url: `/agency/clients/${r.id}`,
    updatedAt: r.created_at,
  }))
}

async function searchFinancial(keywords: string[]): Promise<ContextItem[]> {
  const items: ContextItem[] = []

  // Recent EOM runs
  try {
    const eomRows = await queryRows(`
      SELECT id, month, year, status, total_ex_gst, invoice_count, line_item_count
      FROM eom_runs
      ORDER BY year DESC, month DESC
      LIMIT 3
    `)

    for (const r of eomRows) {
      items.push({
        type: 'spend',
        id: r.id,
        title: `EOM Run ${r.year}-${String(r.month).padStart(2, '0')}`,
        snippet: `Status: ${r.status} | ${r.invoice_count} invoices | ${r.line_item_count} line items${r.total_ex_gst ? ` | $${Number(r.total_ex_gst).toLocaleString()} ex GST` : ''}`,
        url: `/agency/eom/${r.id}`,
        updatedAt: new Date(r.year, r.month - 1).toISOString(),
      })
    }
  } catch {
    // eom_runs table may not exist yet
  }

  // Recent media spend summary
  try {
    const spendRows = await queryRows(`
      SELECT platform, SUM(actual_spend) as total_spend,
             COUNT(DISTINCT client_id) as client_count,
             MAX(period) as latest_period
      FROM media_spend
      GROUP BY platform
      ORDER BY total_spend DESC
      LIMIT 3
    `)

    for (const r of spendRows) {
      items.push({
        type: 'spend',
        id: `spend-${r.platform}`,
        title: `${r.platform} Ad Spend`,
        snippet: `$${Number(r.total_spend).toLocaleString()} total | ${r.client_count} clients | Latest: ${r.latest_period}`,
        url: `/agency/social/spend`,
        updatedAt: r.latest_period ? new Date(r.latest_period).toISOString() : undefined,
      })
    }
  } catch {
    // media_spend table may not exist yet
  }

  return items.slice(0, 5)
}

async function searchTeam(keywords: string[]): Promise<ContextItem[]> {
  const pattern = keywords.length > 0 ? keywords.join('|') : '.*'
  const rows = await queryRows(`
    SELECT tm.id, tm.name, tm.role, tm.email, tm.created_at,
           COUNT(t.id) FILTER (WHERE t.status NOT IN ('done', 'complete', 'skipped')) as active_tasks
    FROM team_members tm
    LEFT JOIN tasks t ON t.assignee_id = tm.id AND t.parent_task_id IS NULL
    WHERE tm.is_active = true
      AND (tm.name ~* $1 OR tm.role ~* $1)
    GROUP BY tm.id, tm.name, tm.role, tm.email, tm.created_at
    ORDER BY active_tasks DESC
    LIMIT 5
  `, [pattern])

  return rows.map(r => ({
    type: 'team',
    id: r.id,
    title: r.name,
    snippet: `Role: ${r.role} | ${r.active_tasks} active tasks`,
    url: `/agency/team`,
    updatedAt: r.created_at,
  }))
}

// Search knowledge base articles for process/SOP queries
async function searchKnowledge(keywords: string[], question: string, event?: H3Event): Promise<ContextItem[]> {
  const items: ContextItem[] = []

  // Text search
  if (keywords.length > 0) {
    const pattern = keywords.join('|')
    try {
      const rows = await queryRows(`
        SELECT id, title, content, category, tags, view_count, updated_at
        FROM ai_knowledge_articles
        WHERE is_published = true
          AND (title ~* $1 OR content ~* $1)
        ORDER BY usefulness_score DESC, view_count DESC
        LIMIT 3
      `, [pattern])

      for (const r of rows) {
        items.push({
          type: 'knowledge',
          id: r.id,
          title: r.title,
          snippet: r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content,
          url: `/agency/ai/knowledge`,
          relevanceScore: 0.7,
          updatedAt: r.updated_at,
        })
      }
    } catch {
      // ai_knowledge_articles may not exist yet
    }
  }

  // Semantic search via Vectorize (complements text search)
  try {
    const semanticResults = event ? await searchSimilar(event, question, 3) : await searchSimilar(question, 3)
    for (const match of semanticResults) {
      if (match.metadata?.type === 'knowledge_article' && match.score > 0.6) {
        // Avoid duplicates from text search
        const existing = items.find(i => i.id === match.metadata.id)
        if (existing) {
          existing.semanticScore = match.score
        } else {
          items.push({
            type: 'knowledge',
            id: match.metadata.id || '',
            title: match.metadata.title || 'Knowledge Article',
            snippet: `Category: ${match.metadata.category || 'General'} (semantic match: ${Math.round(match.score * 100)}%)`,
            url: `/agency/ai/knowledge`,
            semanticScore: match.score,
          })
        }
      }
    }
  } catch {
    // Vectorize not available
  }

  return items.slice(0, 3)
}

// Attach semantic scores from Vectorize to DB-sourced items (single query)
async function semanticRerank(items: ContextItem[], question: string, event?: H3Event): Promise<ContextItem[]> {
  if (items.length === 0) return items

  try {
    const topK = Math.min(items.length * 2, 20)
    const results = event ? await searchSimilar(event, question, topK) : await searchSimilar(question, topK)
    if (results.length === 0) return items

    const scoreMap = new Map<string, number>()
    for (const r of results) {
      const type = r.metadata?.type === 'knowledge_article' ? 'knowledge' : (r.metadata?.type || '')
      const id = r.metadata?.id || r.id
      scoreMap.set(`${type}:${id}`, r.score)
    }

    return items.map(item => {
      const key = `${item.type}:${item.id}`
      const score = scoreMap.get(key)
      return score !== undefined ? { ...item, semanticScore: Math.max(item.semanticScore || 0, score) } : item
    })
  } catch {
    // Vectorize unavailable — return items unmodified
    return items
  }
}

// 5-signal composite scoring: semantic + recency + importance + intent + entity
function compositeScore(items: ContextItem[], intent: AiIntent, entities: string[]): ContextItem[] {
  const profile = SCORING_PROFILES[intent] || SCORING_PROFILES.general
  const primarySources = INTENT_TO_SOURCES[intent] || ['tasks', 'clients']
  const lambda = Math.LN2 / profile.recencyHalfLifeDays
  const now = Date.now()
  const entitiesLower = entities.map(e => e.toLowerCase())

  return items.map(item => {
    // 1. Semantic signal
    const semantic = item.semanticScore || 0

    // 2. Recency signal (exponential decay)
    let recency = 0.5 // neutral default when no timestamp
    if (item.updatedAt) {
      const ageDays = Math.max(0, (now - new Date(item.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
      recency = Math.exp(-lambda * ageDays)
    }

    // 3. Importance signal (entity-type static weight)
    const importance = ENTITY_IMPORTANCE[item.type] || 0.50

    // 4. Intent match signal (binary: is this type a primary source for the intent?)
    const intentMatch = primarySources.includes(item.type) ? 1.0 : 0.0

    // 5. Entity overlap signal (fraction of entities found in item text)
    let entityOverlap = 0
    if (entitiesLower.length > 0) {
      const itemText = `${item.title} ${item.snippet}`.toLowerCase()
      let matchCount = 0
      for (const e of entitiesLower) {
        if (itemText.includes(e)) matchCount++
      }
      entityOverlap = matchCount / entitiesLower.length
    }

    const score =
      (profile.semantic * semantic) +
      (profile.recency * recency) +
      (profile.importance * importance) +
      (profile.intent * intentMatch) +
      (profile.entity * entityOverlap)

    return { ...item, relevanceScore: Math.min(score, 1.0) }
  }).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
}

// Penalize over-representation of a single type in top results
function applyDiversityPenalty(items: ContextItem[]): ContextItem[] {
  const typeCounts = new Map<string, number>()
  const penalized = items.map(item => {
    const count = (typeCounts.get(item.type) || 0) + 1
    typeCounts.set(item.type, count)
    if (count > 3) {
      const penalty = 0.08 * (count - 3)
      return { ...item, relevanceScore: Math.max(0, (item.relevanceScore || 0) - penalty) }
    }
    return item
  })
  return penalized.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
}

export async function retrieveContext(
  userId: string,
  userRole: string,
  question: string,
  event?: H3Event
): Promise<ContextBundle> {
  const keywords = extractKeywords(question)

  // Use the intent classifier for smarter source selection
  const intentResult = await classifyIntent(question)
  const sources = new Set(INTENT_TO_SOURCES[intentResult.intent] || ['tasks', 'clients'])

  // If entities were detected, also search clients and tasks for those names
  if (intentResult.entities.length > 0) {
    sources.add('clients')
    sources.add('tasks')
  }

  const queryPromises: Promise<ContextItem[]>[] = []

  if (sources.has('tasks')) {
    queryPromises.push(searchTasks(userId, keywords).catch(() => []))
  }
  if (sources.has('briefs')) {
    queryPromises.push(searchBriefs(keywords).catch(() => []))
  }
  if (sources.has('boards')) {
    queryPromises.push(searchBoards(userId).catch(() => []))
  }
  if (sources.has('clients')) {
    queryPromises.push(searchClients(keywords).catch(() => []))
  }
  if (sources.has('financial')) {
    queryPromises.push(searchFinancial(keywords).catch(() => []))
  }
  if (sources.has('team')) {
    queryPromises.push(searchTeam(keywords).catch(() => []))
  }
  if (sources.has('knowledge')) {
    queryPromises.push(searchKnowledge(keywords, question, event).catch(() => []))
  }

  const results = await Promise.all(queryPromises)
  const allItems = results.flat()

  // Deduplicate by id
  const seen = new Set<string>()
  const unique: ContextItem[] = []
  for (const item of allItems) {
    const key = `${item.type}:${item.id}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }

  // Composite scoring pipeline
  const reranked = await semanticRerank(unique, question, event)
  const scored = compositeScore(reranked, intentResult.intent, intentResult.entities)
  const diverse = applyDiversityPenalty(scored)

  // Token budget: ~3000 tokens for context
  let tokenCount = 0
  const budgetItems: ContextItem[] = []
  for (const item of diverse) {
    const itemTokens = estimateTokens(`${item.type}: ${item.title} — ${item.snippet}`)
    if (tokenCount + itemTokens > 3000) break
    budgetItems.push(item)
    tokenCount += itemTokens
  }

  return {
    items: budgetItems,
    tokenEstimate: tokenCount,
    intent: intentResult.intent,
    intentConfidence: intentResult.confidence,
    entities: intentResult.entities,
  }
}
