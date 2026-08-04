import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: unknown) => unknown
}
testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => event.query || {}
testGlobal.createError = input => input

const requirePermission = vi.fn()
const resolvePersonalAssistantContext = vi.fn()
const queryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args)
}))
vi.mock('~~/server/utils/ai/personalAssistantContext', () => ({
  resolvePersonalAssistantContext: (...args: unknown[]) => resolvePersonalAssistantContext(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => queryRows(...args)
}))

const { default: boardReviewQueue } = await import('~~/server/api/agency/ai/knowledge/board-review.get')

const ACCESSIBLE_BOARD_ID = '11111111-1111-4111-8111-111111111111'
const INACCESSIBLE_BOARD_ID = '22222222-2222-4222-8222-222222222222'

function queueRow(departmentId = ACCESSIBLE_BOARD_ID) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    department_id: departmentId,
    board_name: departmentId === ACCESSIBLE_BOARD_ID ? 'Finance' : 'Secret board',
    source_file_name: 'Cashflow policy.pdf',
    source_type: 'board_file',
    review_status: 'pending',
    extraction_status: 'ready',
    index_status: 'not_indexed',
    extraction_error_message: null,
    submitted_at: '2026-08-04T01:00:00.000Z',
    submitted_by_name: 'Clara'
  }
}

describe('agency Board Knowledge review queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: 'user-1', role: 'manager' })
    resolvePersonalAssistantContext.mockResolvedValue({
      departments: [{ departmentId: ACCESSIBLE_BOARD_ID }]
    })
    queryRows.mockResolvedValue([queueRow(), queueRow(INACCESSIBLE_BOARD_ID)])
  })

  it('requires MANAGEMENT and omits submissions outside server-derived board scope', async () => {
    const event: TestEvent = { query: { status: 'pending' } }
    const result = await boardReviewQueue(event as never)

    expect(requirePermission).toHaveBeenCalledWith(event, 'MANAGEMENT')
    expect(resolvePersonalAssistantContext).toHaveBeenCalledWith({ userId: 'user-1', event })
    expect(queryRows.mock.calls[0]?.[1]).toEqual([[ACCESSIBLE_BOARD_ID]])
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ boardId: ACCESSIBLE_BOARD_ID, boardName: 'Finance' })
  })

  it.each([
    ['pending', /bks\.review_status = 'pending'[\s\S]*bks\.extraction_status <> 'failed'[\s\S]*bks\.index_status <> 'failed'/],
    ['failed', /bks\.extraction_status = 'failed'[\s\S]*bks\.index_status = 'failed'/],
    ['all', /TRUE/]
  ])('applies the %s queue filter', async (status, sqlPattern) => {
    await boardReviewQueue({ query: { status } } as never)
    expect(queryRows.mock.calls[0]?.[0]).toMatch(sqlPattern)
  })

  it('rejects unsupported status filters', async () => {
    await expect(boardReviewQueue({ query: { status: 'approved' } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(queryRows).not.toHaveBeenCalled()
  })

  it('renders a compact queue whose links open the source board review', () => {
    const page = readFileSync('app/pages/agency/ai/knowledge/index.vue', 'utf8')
    const boardFiles = readFileSync('app/components/board/views/BoardFilesView.vue', 'utf8')

    expect(page).toContain('data-testid="board-knowledge-review-queue"')
    expect(page).toContain('/api/agency/ai/knowledge/board-review')
    expect(page).toContain(`view: 'files'`)
    expect(page).toContain('knowledge: item.id')
    expect(page).toContain('Open in board')
    expect(boardFiles).toContain('route.query.knowledge')
    expect(boardFiles).toContain('requestedKnowledgeSubmission')
  })
})
