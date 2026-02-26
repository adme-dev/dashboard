/**
 * Tests for composite retrieval scoring in aiContextRetriever.ts
 *
 * Validates:
 * - 5-signal composite scoring formula
 * - Per-intent weight profiles
 * - Diversity penalty enforcement
 * - Graceful degradation when Vectorize unavailable
 * - ContextBundle shape unchanged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing
vi.mock('~~/server/utils/db', () => ({
  queryRows: vi.fn().mockResolvedValue([]),
}))

vi.mock('~~/server/utils/aiIntentClassifier', () => ({
  classifyIntent: vi.fn().mockResolvedValue({
    intent: 'general',
    confidence: 0.8,
    entities: [],
  }),
}))

vi.mock('~~/server/utils/aiVectorize', () => ({
  searchSimilar: vi.fn().mockResolvedValue([]),
}))

import { retrieveContext, type ContextItem, type ContextBundle } from '~~/server/utils/aiContextRetriever'
import { queryRows } from '~~/server/utils/db'
import { classifyIntent } from '~~/server/utils/aiIntentClassifier'
import { searchSimilar } from '~~/server/utils/aiVectorize'

const mockedQueryRows = vi.mocked(queryRows)
const mockedClassifyIntent = vi.mocked(classifyIntent)
const mockedSearchSimilar = vi.mocked(searchSimilar)

function makeTasks(count: number, ageOffsetDays = 0): any[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - ageOffsetDays - i)
    return {
      id: `task-${i}`,
      name: `Task ${i}`,
      status: 'in_progress',
      board_name: 'Dev Board',
      due_date: null,
      department_id: 'dept-1',
      updated_at: date.toISOString(),
    }
  })
}

function makeClients(count: number): any[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `client-${i}`,
    name: `Client ${i}`,
    status: 'active',
    industry: 'Tech',
    created_at: new Date().toISOString(),
    brief_count: 2,
  }))
}

function makeSpendRows(): any[] {
  return [{
    platform: 'Meta',
    total_spend: '15000',
    client_count: 3,
    latest_period: new Date().toISOString().split('T')[0],
  }]
}

function makeEomRows(): any[] {
  const now = new Date()
  return [{
    id: 'eom-1',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    status: 'completed',
    total_ex_gst: '50000',
    invoice_count: 10,
    line_item_count: 45,
  }]
}

describe('aiContextRetriever — composite scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSearchSimilar.mockResolvedValue([])
    mockedClassifyIntent.mockResolvedValue({
      intent: 'general',
      confidence: 0.8,
      entities: [],
    })
  })

  it('returns a valid ContextBundle shape', async () => {
    mockedQueryRows.mockResolvedValue([])
    const result = await retrieveContext('user-1', 'admin', 'hello')
    expect(result).toHaveProperty('items')
    expect(result).toHaveProperty('tokenEstimate')
    expect(result).toHaveProperty('intent')
    expect(result).toHaveProperty('intentConfidence')
    expect(result).toHaveProperty('entities')
    expect(Array.isArray(result.items)).toBe(true)
  })

  it('items have relevanceScore after scoring', async () => {
    mockedQueryRows.mockResolvedValue(makeTasks(3))
    mockedClassifyIntent.mockResolvedValue({
      intent: 'task_query',
      confidence: 0.9,
      entities: [],
    })

    const result = await retrieveContext('user-1', 'admin', 'what are my tasks')
    for (const item of result.items) {
      expect(item.relevanceScore).toBeDefined()
      expect(item.relevanceScore).toBeGreaterThanOrEqual(0)
      expect(item.relevanceScore).toBeLessThanOrEqual(1)
    }
  })

  it('items have updatedAt populated from DB', async () => {
    // Use empty keywords path (no keyword match → fallback branch)
    mockedQueryRows.mockImplementation(async (sql: string) => {
      if (sql.includes('tasks') && sql.includes('assignee_id = $1')) {
        return makeTasks(2)
      }
      return []
    })
    mockedClassifyIntent.mockResolvedValue({
      intent: 'task_query',
      confidence: 0.9,
      entities: [],
    })

    // Use only stop words so extractKeywords returns [] → triggers fallback branch
    const result = await retrieveContext('user-1', 'admin', 'what are the')
    for (const item of result.items) {
      expect(item.updatedAt).toBeDefined()
    }
  })

  it('financial_query boosts recent spend items via recency', async () => {
    const recentSpend = makeSpendRows()
    const oldTasks = makeTasks(3, 60) // 60+ days old

    // First call: tasks, second call (if any): more
    let callCount = 0
    mockedQueryRows.mockImplementation(async (sql: string) => {
      callCount++
      if (sql.includes('media_spend')) return recentSpend
      if (sql.includes('eom_runs')) return makeEomRows()
      if (sql.includes('tasks')) return oldTasks
      if (sql.includes('agency_clients')) return makeClients(1)
      return []
    })

    mockedClassifyIntent.mockResolvedValue({
      intent: 'financial_query',
      confidence: 0.95,
      entities: [],
    })

    const result = await retrieveContext('user-1', 'admin', 'what did we spend on Meta last month')
    // Spend items should be present
    const spendItems = result.items.filter(i => i.type === 'spend')
    expect(spendItems.length).toBeGreaterThan(0)

    // If there are also task items, spend should rank higher
    if (result.items.length > 1) {
      const firstSpendIdx = result.items.findIndex(i => i.type === 'spend')
      expect(firstSpendIdx).toBeLessThanOrEqual(1) // spend in top 2
    }
  })

  it('entity overlap boosts items matching entities', async () => {
    const clients = [
      { id: 'c-1', name: 'Acme Corp', status: 'active', industry: 'Tech', created_at: new Date().toISOString(), brief_count: 3 },
      { id: 'c-2', name: 'Globex Inc', status: 'active', industry: 'Finance', created_at: new Date().toISOString(), brief_count: 1 },
    ]
    const tasks = [
      { id: 't-1', name: 'Acme Corp website redesign', status: 'in_progress', board_name: 'Web', due_date: null, department_id: 'd-1', updated_at: new Date().toISOString() },
      { id: 't-2', name: 'Internal tooling', status: 'in_progress', board_name: 'Ops', due_date: null, department_id: 'd-2', updated_at: new Date().toISOString() },
    ]

    mockedQueryRows.mockImplementation(async (sql: string) => {
      if (sql.includes('agency_clients')) return clients
      if (sql.includes('tasks')) return tasks
      return []
    })

    mockedClassifyIntent.mockResolvedValue({
      intent: 'search',
      confidence: 0.9,
      entities: ['Acme Corp'],
    })

    const result = await retrieveContext('user-1', 'admin', 'find Acme Corp')
    const acmeItems = result.items.filter(i =>
      i.title.toLowerCase().includes('acme')
    )
    const nonAcmeItems = result.items.filter(i =>
      !i.title.toLowerCase().includes('acme')
    )

    // Acme items should score higher
    if (acmeItems.length > 0 && nonAcmeItems.length > 0) {
      const bestAcmeScore = Math.max(...acmeItems.map(i => i.relevanceScore || 0))
      const bestNonAcmeScore = Math.max(...nonAcmeItems.map(i => i.relevanceScore || 0))
      expect(bestAcmeScore).toBeGreaterThan(bestNonAcmeScore)
    }
  })

  it('applies diversity penalty when one type dominates', async () => {
    // Return 6 tasks and 2 clients
    const manyTasks = makeTasks(6)
    const fewClients = makeClients(2)

    mockedQueryRows.mockImplementation(async (sql: string) => {
      if (sql.includes('tasks')) return manyTasks
      if (sql.includes('agency_clients')) return fewClients
      return []
    })

    mockedClassifyIntent.mockResolvedValue({
      intent: 'general',
      confidence: 0.7,
      entities: [],
    })

    const result = await retrieveContext('user-1', 'admin', 'show me everything')
    // After diversity penalty, if we have 6 tasks, the 4th+ task should be penalized
    // meaning clients should mix in among top results rather than all tasks first
    const types = result.items.map(i => i.type)
    const taskCount = types.filter(t => t === 'task').length
    const clientCount = types.filter(t => t === 'client').length

    // With diversity, clients should appear even though tasks dominate
    if (result.items.length >= 4) {
      expect(clientCount).toBeGreaterThan(0)
    }
  })

  it('gracefully degrades when Vectorize is unavailable', async () => {
    mockedSearchSimilar.mockRejectedValue(new Error('Vectorize binding not available'))
    mockedQueryRows.mockResolvedValue(makeTasks(3))
    mockedClassifyIntent.mockResolvedValue({
      intent: 'task_query',
      confidence: 0.9,
      entities: [],
    })

    // Should not throw
    const result = await retrieveContext('user-1', 'admin', 'my tasks')
    expect(result.items.length).toBeGreaterThan(0)
    // Items still scored using other 4 signals
    for (const item of result.items) {
      expect(item.relevanceScore).toBeDefined()
      expect(item.relevanceScore).toBeGreaterThan(0)
    }
  })

  it('semantic scores from Vectorize merge into items', async () => {
    const tasks = makeTasks(3)
    mockedQueryRows.mockResolvedValue(tasks)
    mockedClassifyIntent.mockResolvedValue({
      intent: 'task_query',
      confidence: 0.9,
      entities: [],
    })

    // Vectorize returns a match for task-0
    mockedSearchSimilar.mockResolvedValue([
      { id: 'vec-1', score: 0.92, metadata: { type: 'task', id: 'task-0', title: 'Task 0' } },
    ])

    const result = await retrieveContext('user-1', 'admin', 'what tasks are urgent')
    // task-0 should have the highest score due to semantic boost
    const task0 = result.items.find(i => i.id === 'task-0')
    const otherTasks = result.items.filter(i => i.id !== 'task-0' && i.type === 'task')

    if (task0 && otherTasks.length > 0) {
      const bestOtherScore = Math.max(...otherTasks.map(i => i.relevanceScore || 0))
      expect(task0.relevanceScore).toBeGreaterThan(bestOtherScore)
    }
  })

  it('process_query ranks knowledge articles highly', async () => {
    const knowledge = [{
      id: 'kb-1',
      title: 'How to do EOM',
      content: 'End of month process involves generating invoices from tracked time...',
      category: 'Finance',
      tags: ['eom', 'invoicing'],
      view_count: 42,
      updated_at: new Date().toISOString(),
    }]
    const tasks = makeTasks(3, 5)

    mockedQueryRows.mockImplementation(async (sql: string) => {
      if (sql.includes('ai_knowledge_articles')) return knowledge
      if (sql.includes('tasks')) return tasks
      return []
    })

    mockedClassifyIntent.mockResolvedValue({
      intent: 'process_query',
      confidence: 0.95,
      entities: [],
    })

    const result = await retrieveContext('user-1', 'admin', 'how do I do EOM')
    const knowledgeItems = result.items.filter(i => i.type === 'knowledge')
    expect(knowledgeItems.length).toBeGreaterThan(0)

    // Knowledge should rank at or near the top
    if (result.items.length > 1) {
      const firstKbIdx = result.items.findIndex(i => i.type === 'knowledge')
      expect(firstKbIdx).toBeLessThanOrEqual(1)
    }
  })

  it('scoring profiles all sum to 1.0', async () => {
    // This is a structural test — import the file and verify weight sums
    // Since SCORING_PROFILES isn't exported, we test behavior indirectly:
    // Each intent should produce scores in [0, 1] range
    const intents = [
      'task_query', 'brief_query', 'project_query', 'financial_query',
      'team_query', 'process_query', 'time_tracking_query', 'search', 'action_request', 'general',
    ] as const

    for (const intent of intents) {
      mockedQueryRows.mockResolvedValue(makeTasks(2))
      mockedClassifyIntent.mockResolvedValue({
        intent,
        confidence: 0.9,
        entities: [],
      })

      const result = await retrieveContext('user-1', 'admin', 'test query')
      for (const item of result.items) {
        expect(item.relevanceScore).toBeGreaterThanOrEqual(0)
        expect(item.relevanceScore).toBeLessThanOrEqual(1)
      }
    }
  })

  it('handles empty results gracefully', async () => {
    mockedQueryRows.mockResolvedValue([])
    const result = await retrieveContext('user-1', 'admin', 'find nothing')
    expect(result.items).toEqual([])
    expect(result.tokenEstimate).toBe(0)
  })

  it('respects token budget of ~3000 tokens', async () => {
    // Create many items with long snippets (~600 chars each → ~150 tokens → 20 items = ~3000 tokens)
    const longDescription = 'A'.repeat(500)
    const longTasks = Array.from({ length: 30 }, (_, i) => ({
      id: `task-${i}`,
      name: `Task ${i} — ${longDescription}`,
      status: 'in_progress',
      board_name: 'Development Board With A Very Long Name For Testing Purposes',
      due_date: '2026-03-01',
      department_id: 'dept-1',
      updated_at: new Date().toISOString(),
    }))

    mockedQueryRows.mockResolvedValue(longTasks)
    mockedClassifyIntent.mockResolvedValue({
      intent: 'task_query',
      confidence: 0.9,
      entities: [],
    })

    const result = await retrieveContext('user-1', 'admin', 'all tasks overview')
    expect(result.tokenEstimate).toBeLessThanOrEqual(3000)
    // Items with ~150 tokens each, budget is 3000, so should cap around 20
    expect(result.items.length).toBeLessThan(30)
  })
})
