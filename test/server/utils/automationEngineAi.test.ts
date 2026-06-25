import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockCreateNotification = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_8B: 'llama-3.1-8b-instant',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { evaluateAutomations } = await import('~~/server/utils/automationEngine')

describe('automationEngine AI telemetry', () => {
  beforeEach(() => {
    mockQueryRows.mockReset()
    mockQueryOne.mockReset()
    mockCreateNotification.mockReset().mockResolvedValue({ id: 'notification-1' })
    mockGenerateGroqInsight.mockReset().mockResolvedValue('AI says this needs attention.')
  })

  it('records Model Ops metadata for generated task event insights', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'automation-1',
        board_id: 'board-1',
        name: 'AI status insight',
        trigger_type: 'status_changed',
        trigger_config: { toStatus: 'Stuck' },
        action_type: 'generate_ai_insight',
        action_config: { to: 'assignee', prompt: 'Explain the operational risk.' },
      },
    ])
    mockQueryOne.mockResolvedValueOnce({
      id: 'task-1',
      title: 'Launch campaign',
      status_name: 'Stuck',
      assignee_name: 'Jane',
      assignee_id: 'assignee-1',
      creator_id: 'creator-1',
    })

    await evaluateAutomations('board-1', {
      boardId: 'board-1',
      type: 'status_changed',
      taskId: 'task-1',
      actorId: 'actor-1',
      changes: { oldStatusName: 'Working', newStatusName: 'Stuck' },
    })

    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Launch campaign'), expect.objectContaining({
      model: 'llama-3.1-8b-instant',
      featureKey: 'board_automation_ai_insight',
      userId: 'actor-1',
      requestId: 'automation-1',
      metadata: {
        route: 'automationEngine.executeGenerateAiInsight',
        automationId: 'automation-1',
        boardId: 'board-1',
        taskId: 'task-1',
        eventType: 'status_changed',
        actionType: 'generate_ai_insight',
        triggerType: 'status_changed',
        hasTask: true,
        hasAssignee: true,
        hasCreator: true,
        changeCount: 2,
      },
    }))
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'assignee-1',
      type: 'system',
      title: 'AI Insight: Launch campaign',
      message: 'AI says this needs attention.',
    }))
  })

  it('records Model Ops metadata for board AI summaries', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'automation-2',
        board_id: 'board-1',
        name: 'Weekly board summary',
        trigger_type: 'item_created',
        trigger_config: {},
        action_type: 'ai_summary',
        action_config: { recipientId: 'recipient-1', prompt: 'Summarise the board.' },
      },
    ])
    mockQueryOne.mockResolvedValueOnce({
      name: 'Delivery Board',
      total_tasks: '12',
      done_tasks: '5',
      overdue_tasks: '2',
      blocked_tasks: '1',
    })

    await evaluateAutomations('board-1', {
      boardId: 'board-1',
      type: 'task_created',
      actorId: 'actor-1',
    })

    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Delivery Board'), expect.objectContaining({
      model: 'llama-3.1-8b-instant',
      featureKey: 'board_automation_ai_summary',
      userId: 'actor-1',
      requestId: 'automation-2',
      metadata: {
        route: 'automationEngine.executeAiSummary',
        automationId: 'automation-2',
        boardId: 'board-1',
        eventType: 'task_created',
        actionType: 'ai_summary',
        triggerType: 'item_created',
        totalTasks: 12,
        doneTasks: 5,
        overdueTasks: 2,
        blockedTasks: 1,
        hasConfiguredRecipient: true,
      },
    }))
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'recipient-1',
      type: 'system',
      title: 'Board Summary: Delivery Board',
      message: 'AI says this needs attention.',
    }))
  })
})
