import { beforeEach, describe, expect, it, vi } from 'vitest'

const BOARD_ID = '11111111-1111-4111-8111-111111111111'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_ID = '44444444-4444-4444-8444-444444444444'
const DONE_STATUS_ID = '55555555-5555-4555-8555-555555555555'

const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockRequireBoardAccess = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockTransaction = vi.fn()
const mockReadBody = vi.fn()
const mockEmitBoardEvent = vi.fn()
const mockEnqueue = vi.fn()

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: (event: unknown, name: string) => string | undefined
  readBody: <T>(event: unknown) => Promise<T>
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getRouterParam = (_event, name) => name === 'id' ? TASK_ID : undefined
testGlobal.readBody = (...args: unknown[]) => mockReadBody(...args)
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
  requireBoardAccess: (...args: unknown[]) => mockRequireBoardAccess(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

vi.mock('~~/server/utils/boardEvents', () => ({
  emitBoardEvent: (...args: unknown[]) => mockEmitBoardEvent(...args)
}))

vi.mock('~~/server/utils/boardNotifications', () => ({ notifyBoardSubscribers: vi.fn() }))
vi.mock('~~/server/utils/automationEngine', () => ({ evaluateAutomations: vi.fn() }))
vi.mock('~~/server/utils/automation/lifecycleGuard', () => ({ evaluateLifecycleTransition: vi.fn() }))
vi.mock('~~/server/utils/queue', () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args)
}))
vi.mock('~~/server/utils/boardChatBridge', () => ({ postBoardEventToChat: vi.fn().mockResolvedValue(undefined) }))
vi.mock('~~/server/utils/notifications', () => ({ notifyTaskStatusChanged: vi.fn().mockResolvedValue(undefined) }))
vi.mock('~~/server/utils/briefConversion/completionAlert', () => ({ maybeProposeBriefCompletion: vi.fn().mockResolvedValue(undefined) }))

const { default: createStatusHandler } = await import(
  '../../../../server/api/agency/statuses/index.post'
)
const { default: updateTaskStatusHandler } = await import(
  '../../../../server/api/agency/tasks/[id]/status.patch'
)

describe('agency board status security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    mockRequireWriteAccess.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    mockRequireBoardAccess.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    mockReadBody.mockResolvedValue({
      statusId: DONE_STATUS_ID,
      userId: 'spoofed-user-id'
    })
  })

  it('requires authentication before creating a board-specific status', async () => {
    mockReadBody.mockResolvedValue({
      name: 'Verified',
      category: 'done',
      departmentId: BOARD_ID,
      isFinal: true
    })
    mockQueryOne
      .mockResolvedValueOnce({ max_order: 1 })
      .mockResolvedValueOnce({
        id: DONE_STATUS_ID,
        department_id: BOARD_ID,
        name: 'Verified',
        slug: 'verified',
        color: '#22C55E',
        category: 'done',
        is_default: false,
        is_final: true,
        sort_order: 2,
        created_at: '2026-07-18T00:00:00.000Z'
      })

    await createStatusHandler({} as never)

    expect(mockRequireWriteAccess).toHaveBeenCalledOnce()
    expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.anything(), BOARD_ID)
  })

  it('derives the status-change actor from authentication and scopes status selection to the task board', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [] })
    mockTransaction.mockImplementation(async (work: (client: { query: typeof clientQuery }) => unknown) => work({ query: clientQuery }))
    mockQueryOne
      .mockResolvedValueOnce({
        id: TASK_ID,
        title: 'T1 — Architecture',
        department_id: BOARD_ID,
        project_id: null,
        reporter_id: null,
        assignee_id: null,
        status_id: 'to-do-status',
        old_status_name: 'To Do',
        version: 1
      })
      .mockResolvedValueOnce({
        id: DONE_STATUS_ID,
        name: 'Verified',
        is_final: true,
        department_id: BOARD_ID
      })
      .mockResolvedValueOnce({
        id: TASK_ID,
        status_id: DONE_STATUS_ID,
        completed_at: '2026-07-18T00:00:00.000Z',
        updated_at: '2026-07-18T00:00:00.000Z',
        version: 2,
        last_modified_by: ACTOR_ID,
        status_name: 'Verified',
        status_color: '#22C55E',
        status_category: 'done',
        status_is_final: true
      })

    await updateTaskStatusHandler({} as never)

    expect(mockRequireWriteAccess).toHaveBeenCalledOnce()
    expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.anything(), BOARD_ID)
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('department_id IS NULL OR department_id = $2'),
      [DONE_STATUS_ID, BOARD_ID]
    )
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('last_modified_by = $3'),
      [DONE_STATUS_ID, TASK_ID, ACTOR_ID]
    )
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('\'status_change\''),
      expect.arrayContaining([TASK_ID, ACTOR_ID])
    )
  })

  it('rejects a status owned by another board', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: TASK_ID,
        department_id: BOARD_ID,
        status_id: 'to-do-status',
        old_status_name: 'To Do',
        version: 1
      })
      .mockResolvedValueOnce(null)

    await expect(updateTaskStatusHandler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid status ID for this board'
    })

    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('department_id IS NULL OR department_id = $2'),
      [DONE_STATUS_ID, BOARD_ID]
    )
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
