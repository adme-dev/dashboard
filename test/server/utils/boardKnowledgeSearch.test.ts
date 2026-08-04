import { describe, expect, it, vi } from 'vitest'

const ACTIVE_BOARD_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_BOARD_ID = '22222222-2222-4222-8222-222222222222'
const INACCESSIBLE_BOARD_ID = '33333333-3333-4333-8333-333333333333'

const { searchBoardKnowledge } = await import('~~/server/utils/boardKnowledge/search')

function row(overrides: Record<string, unknown>) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    article_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    department_id: ACTIVE_BOARD_ID,
    scope_key: `board:${ACTIVE_BOARD_ID}`,
    title: 'Cashflow policy',
    content: 'Pay approved supplier invoices every Friday.',
    source_file_name: 'Cashflow policy.pdf',
    board_name: 'Finance',
    page_start: 2,
    page_end: 2,
    sheet_name: null,
    slide_number: null,
    ...overrides
  }
}

function dependencies() {
  const queryVectors = vi.fn(async (_values: number[], input: { scopeKeys: string[] }) => {
    if (input.scopeKeys.length === 1 && input.scopeKeys[0] === `board:${ACTIVE_BOARD_ID}`) {
      return [{ id: 'vector-active', score: 0.88, metadata: { chunkId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', scopeKey: `board:${ACTIVE_BOARD_ID}` } }]
    }
    return [
      { id: 'vector-inaccessible', score: 0.99, metadata: { chunkId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', scopeKey: `board:${INACCESSIBLE_BOARD_ID}` } },
      { id: 'vector-agency', score: 0.90, metadata: { chunkId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', scopeKey: 'agency' } },
      { id: 'vector-other', score: 0.87, metadata: { chunkId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', scopeKey: `board:${OTHER_BOARD_ID}` } },
      { id: 'vector-active-duplicate', score: 0.86, metadata: { chunkId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', scopeKey: `board:${ACTIVE_BOARD_ID}` } }
    ]
  })
  return {
    generateEmbedding: vi.fn(async () => Array.from({ length: 768 }, () => 0.1)),
    queryVectors,
    fetchRows: vi.fn(async () => [
      row({}),
      row({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        article_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        department_id: null,
        scope_key: 'agency',
        title: 'Agency expenses',
        source_file_name: null,
        board_name: null,
        page_start: null,
        page_end: null
      }),
      row({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        department_id: OTHER_BOARD_ID,
        scope_key: `board:${OTHER_BOARD_ID}`,
        source_file_name: 'Supplier process.pdf',
        board_name: 'Operations'
      })
    ])
  }
}

describe('permission-aware Board Knowledge search', () => {
  it('merges agency and accessible boards, drops inaccessible/stale rows, boosts active board, and cites sources', async () => {
    const deps = dependencies()
    const result = await searchBoardKnowledge('when do we pay bills?', {
      departmentIds: [ACTIVE_BOARD_ID, OTHER_BOARD_ID],
      activeBoardId: ACTIVE_BOARD_ID,
      limit: 8
    }, deps)

    expect(deps.generateEmbedding).toHaveBeenCalledTimes(1)
    expect(result.items[0]).toMatchObject({
      boardId: ACTIVE_BOARD_ID,
      sourceFileName: 'Cashflow policy.pdf',
      pageStart: 2,
      url: `/agency/boards/${ACTIVE_BOARD_ID}`
    })
    expect(result.items.filter(item => item.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toHaveLength(1)
    expect(result.items.some(item => item.boardId === INACCESSIBLE_BOARD_ID)).toBe(false)
    expect(result.items.some(item => item.scopeKey === 'agency')).toBe(true)
  })

  it('does not force an irrelevant active-board result above a materially stronger result', async () => {
    const deps = dependencies()
    deps.queryVectors.mockImplementation(async (_values: number[], input: { scopeKeys: string[] }) => (
      input.scopeKeys.length === 1 && input.scopeKeys[0] === `board:${ACTIVE_BOARD_ID}`
        ? [{ id: 'active', score: 0.40, metadata: { chunkId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', scopeKey: `board:${ACTIVE_BOARD_ID}` } }]
        : [{ id: 'agency', score: 0.91, metadata: { chunkId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', scopeKey: 'agency' } }]
    ))

    const result = await searchBoardKnowledge('expense policy', {
      departmentIds: [ACTIVE_BOARD_ID],
      activeBoardId: ACTIVE_BOARD_ID,
      limit: 5
    }, deps)

    expect(result.items[0]?.scopeKey).toBe('agency')
  })

  it('searches agency only when the caller has no accessible boards', async () => {
    const deps = dependencies()
    await searchBoardKnowledge('policy', { departmentIds: [], limit: 5 }, deps)
    expect(deps.queryVectors).toHaveBeenCalledTimes(1)
    expect(deps.queryVectors).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ scopeKeys: ['agency'] }))
  })

  it('batches large scope filters below the Vectorize 2,048-byte JSON limit', async () => {
    const deps = dependencies()
    const departmentIds = Array.from({ length: 80 }, (_, index) => `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`)
    await searchBoardKnowledge('policy', { departmentIds, limit: 5 }, deps)

    expect(deps.queryVectors.mock.calls.length).toBeGreaterThan(1)
    for (const [, input] of deps.queryVectors.mock.calls) {
      expect(new TextEncoder().encode(JSON.stringify({ scopeKey: { $in: input.scopeKeys } })).byteLength).toBeLessThan(2048)
    }
  })

  it('returns an explicit unavailable state when bindings are missing', async () => {
    const deps = dependencies()
    deps.generateEmbedding.mockRejectedValueOnce(new Error('AI binding is not configured'))
    await expect(searchBoardKnowledge('policy', { departmentIds: [], limit: 5 }, deps))
      .resolves.toEqual({ items: [], unavailable: true })
    expect(deps.fetchRows).not.toHaveBeenCalled()
  })
})
