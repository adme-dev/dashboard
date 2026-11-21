import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  execute: vi.fn(),
  executorExecute: vi.fn()
}))

vi.mock('~~/server/utils/db', async (importOriginal) => ({
  ...await importOriginal<typeof import('~~/server/utils/db')>(),
  queryOne: mocks.queryOne,
  execute: mocks.execute,
  queryRows: vi.fn(async () => [])
}))

vi.mock('~~/server/utils/ai/executors', () => ({
  getExecutor: vi.fn(() => ({
    toolName: 'create_task',
    label: 'Create task',
    riskTier: 'confirm',
    executionClass: 'internal-http',
    execute: mocks.executorExecute
  }))
}))

import { executeOwnerMcpConfirm } from '~~/server/utils/ai/mcp/ownerConfirm'

describe('owner MCP confirm execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryOne.mockResolvedValue({ tool_name: 'create_task', resolved_payload: { title: 'Ship' } })
    mocks.execute.mockResolvedValue(1)
    mocks.executorExecute.mockResolvedValue({ resultRef: 'task-1', summary: 'Created task' })
  })

  it('honours a disabled platform flag before executing an owner video proposal', async () => {
    mocks.queryOne.mockResolvedValue({ tool_name: 'video_generation', resolved_payload: { payer: 'agency' } })
    const result = await executeOwnerMcpConfirm({ proposalId: '22222222-2222-4222-8222-222222222222' }, {
      userId: '11111111-1111-4111-8111-111111111111', userRole: 'owner', source: 'mcp',
      godModeExecutionKey: `mcp:${'a'.repeat(64)}`,
      event: { context: { cloudflare: { env: { VIDEO_GENERATION_ENABLED: 'false' } } } } as any
    })
    expect(result).toMatchObject({ ok: false, error: 'Video generation is disabled.' })
    expect(mocks.executorExecute).not.toHaveBeenCalled()
  })

  it('atomically claims an existing MCP pending action and executes its registered operation', async () => {
    const proposalId = '22222222-2222-4222-8222-222222222222'
    const userId = '11111111-1111-4111-8111-111111111111'
    const result = await executeOwnerMcpConfirm(
      { proposalId },
      {
        userId,
        userRole: 'owner',
        source: 'mcp',
        godModeExecutionKey: `mcp:${'a'.repeat(64)}`,
        event: { context: {} } as any
      }
    )

    expect(result).toEqual({
      ok: true,
      data: { resultRef: 'task-1', summary: 'Created task' }
    })
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringMatching(/status='proposed'.*source='mcp'/s), [proposalId, userId])
    expect(mocks.executorExecute).toHaveBeenCalledWith(
      { title: 'Ship' },
      expect.objectContaining({ userId, source: 'mcp' })
    )
  })
})
