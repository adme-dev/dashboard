import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: any) => unknown
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = event => event.body
testGlobal.createError = (opts) => Object.assign(new Error(opts.statusMessage), opts)

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { default: handler } = await import('../../../../server/api/agency/ai/task-assist.post')

function event(body: Record<string, unknown>) {
  return { body } as any
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue({ id: 'user-1' })
  mockQueryRows.mockReset()
  mockQueryOne.mockReset()
  mockGenerateGroqInsight.mockReset()

  mockQueryRows
    .mockResolvedValueOnce([{ id: 'member-1', name: 'Jane', role: 'producer', active_task_count: 2 }])
    .mockResolvedValueOnce([{ id: 'project-1', name: 'Website', client_name: 'Acme' }])
    .mockResolvedValueOnce([{ id: 'status-1', name: 'Todo', category: 'todo', is_default: true, is_final: false }])
})

describe('POST /api/agency/ai/task-assist', () => {
  it('records creation mode metadata on the Groq call', async () => {
    mockQueryOne.mockResolvedValueOnce(null)
    mockGenerateGroqInsight.mockResolvedValueOnce(JSON.stringify({
      title: 'Write homepage copy',
      description: '',
      priority: 'medium',
      assigneeId: 'member-1',
      assigneeName: 'Jane',
      assigneeReason: 'Low workload.',
      projectId: 'project-1',
      projectName: 'Website',
      dueDate: null,
      startDate: null,
      estimatedHours: null,
      statusId: 'status-1',
      confidence: 0.8,
      suggestions: [],
    }))

    const result = await handler(event({
      description: 'Write homepage copy',
      boardId: 'board-1',
      workspaceId: 'workspace-1',
      boardName: 'Marketing',
    }))

    expect(result.title).toBe('Write homepage copy')
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Write homepage copy'), expect.objectContaining({
      model: 'llama-3.3-70b-versatile',
      featureKey: 'agency_task_assist_creation',
      userId: 'user-1',
      requestId: 'board-1',
      metadata: {
        mode: 'creation',
        boardId: 'board-1',
        workspaceId: 'workspace-1',
        hasBoardName: true,
        descriptionChars: 19,
        teamMemberCount: 1,
        projectCount: 1,
        statusCount: 1,
      },
    }))
  })

  it('records analysis mode metadata on the Groq call', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'task-1',
      title: 'Review campaign',
      description: 'Needs review',
      priority: 'high',
      status_id: 'status-1',
      assignee_id: null,
      project_id: 'project-1',
      due_date: null,
      start_date: null,
      estimated_hours: null,
      actual_hours: null,
      is_blocked: false,
      blocked_reason: null,
      created_at: '2026-06-24T00:00:00.000Z',
      updated_at: '2026-06-25T00:00:00.000Z',
      completed_at: null,
      status_name: 'Todo',
      status_category: 'todo',
      assignee_name: null,
      project_name: 'Website',
    })
    mockGenerateGroqInsight.mockResolvedValueOnce(JSON.stringify({
      actions: [{ type: 'status_change', label: 'Move to Todo', reason: 'Start here.', value: 'status-1' }],
      insights: 'The task needs review.',
    }))

    const result = await handler(event({
      taskId: 'task-1',
      boardId: 'board-1',
      workspaceId: 'workspace-1',
    }))

    expect(result.insights).toBe('The task needs review.')
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Review campaign'), expect.objectContaining({
      featureKey: 'agency_task_assist_analysis',
      userId: 'user-1',
      requestId: 'task-1',
      metadata: {
        mode: 'analysis',
        taskId: 'task-1',
        boardId: 'board-1',
        workspaceId: 'workspace-1',
        teamMemberCount: 1,
        projectCount: 1,
        statusCount: 1,
        hasExistingTask: true,
      },
    }))
  })
})
