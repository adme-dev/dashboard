import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

const {
  completePlatformAgentRun,
  failPlatformAgentRun,
  startPlatformAgentRun,
} = await import('~~/server/utils/ai/platformAgentRuns')

describe('platform agent run audit helpers', () => {
  beforeEach(() => {
    mockQueryRows.mockReset()
    mockExecute.mockReset()
  })

  it('starts read/propose-only platform agent runs in the existing agent run table', async () => {
    mockQueryRows.mockResolvedValueOnce([{ id: 'run-1' }])

    const result = await startPlatformAgentRun({
      agentType: 'spend_controller',
      featureKey: 'agent_spend_controller',
      mode: 'read_propose',
      userId: '11111111-1111-4111-8111-111111111111',
      clientId: '22222222-2222-4222-8222-222222222222',
      route: '/agency/social/spend',
      prompt: 'What needs attention?',
      context: { period: '2026-06' },
    })

    expect(result).toEqual({ ok: true, runId: 'run-1' })
    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('INSERT INTO ai_agent_runs')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual([
      'platform_agent_spend_controller',
      expect.stringContaining('"agentType":"spend_controller"'),
    ])
    expect(JSON.parse(String(mockQueryRows.mock.calls[0]?.[1]?.[1]))).toMatchObject({
      source: 'platform_agent',
      agentType: 'spend_controller',
      featureKey: 'agent_spend_controller',
      mode: 'read_propose',
      userId: '11111111-1111-4111-8111-111111111111',
      clientId: '22222222-2222-4222-8222-222222222222',
      route: '/agency/social/spend',
      promptPreview: 'What needs attention?',
      context: { period: '2026-06' },
    })
  })

  it('completes platform agent runs with counts and proposed action metadata', async () => {
    await completePlatformAgentRun({
      runId: 'run-1',
      startedAtMs: Date.now() - 250,
      toolCallCount: 4,
      findingCount: 3,
      proposedActionCount: 2,
      blockedActionCount: 1,
      summary: { answerPreview: 'Review critical pacing first.' },
    })

    expect(mockExecute.mock.calls[0]?.[0]).toContain("SET status = 'completed'")
    expect(mockExecute.mock.calls[0]?.[1]).toEqual([
      expect.any(Number),
      4,
      3,
      0,
      expect.stringContaining('"proposedActionCount":2'),
      'run-1',
    ])
    expect(JSON.parse(String(mockExecute.mock.calls[0]?.[1]?.[4]))).toMatchObject({
      proposedActionCount: 2,
      blockedActionCount: 1,
      answerPreview: 'Review critical pacing first.',
    })
  })

  it('fails platform agent runs with a compact error array', async () => {
    await failPlatformAgentRun({
      runId: 'run-1',
      startedAtMs: Date.now() - 100,
      error: new Error('tool unavailable'),
      toolCallCount: 2,
      findingCount: 1,
    })

    expect(mockExecute.mock.calls[0]?.[0]).toContain("SET status = 'failed'")
    expect(JSON.parse(String(mockExecute.mock.calls[0]?.[1]?.[3]))).toEqual([{ error: 'tool unavailable' }])
  })
})
