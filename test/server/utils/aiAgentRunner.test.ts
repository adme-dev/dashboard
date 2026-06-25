import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockRunAllAnalyzers = vi.fn()
const mockGenerateGroqInsight = vi.fn()
const mockCreateNotification = vi.fn()
const mockSendAiDigestEmail = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

vi.mock('~~/server/utils/aiAgentAnalyzer', () => ({
  runAllAnalyzers: (...args: unknown[]) => mockRunAllAnalyzers(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'https://app.xeroflow.io',
}))

vi.mock('~~/server/utils/email', () => ({
  sendAiDigestEmail: (...args: unknown[]) => mockSendAiDigestEmail(...args),
}))

const { runAgentDigest } = await import('~~/server/utils/aiAgentRunner')

describe('runAgentDigest', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockRunAllAnalyzers.mockReset()
    mockGenerateGroqInsight.mockReset()
    mockCreateNotification.mockReset()
    mockSendAiDigestEmail.mockReset()

    mockQueryOne
      .mockResolvedValueOnce({ id: 'run-1' })
      .mockResolvedValueOnce({ id: 'report-1' })
    mockQueryRows.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alex',
        email: 'alex@example.com',
        role: 'admin',
        ai_agent_preferences: {},
      },
    ])
    mockRunAllAnalyzers.mockResolvedValue([
      {
        type: 'financial_anomalies',
        count: 2,
        findings: [
          { severity: 'critical', title: 'Margin drop', description: 'Margin is down.' },
          { severity: 'warning', title: 'Late invoice', description: 'Invoice is late.' },
        ],
      },
    ])
    mockGenerateGroqInsight.mockResolvedValue('Digest content')
    mockCreateNotification.mockResolvedValue({ id: 'notification-1' })
    mockSendAiDigestEmail.mockResolvedValue(undefined)
    mockExecute.mockResolvedValue({ rowCount: 1 })
  })

  it('records explicit Model Ops metadata for digest report generation', async () => {
    const result = await runAgentDigest('daily_digest')

    expect(result).toEqual({ runId: 'run-1', reportCount: 1 })
    expect(mockGenerateGroqInsight).toHaveBeenCalledTimes(1)
    expect(mockGenerateGroqInsight.mock.calls[0]?.[1]).toMatchObject({
      model: 'llama-3.3-70b-versatile',
      featureKey: 'ai_agent_digest_report',
      userId: 'user-1',
      requestId: 'run-1',
      metadata: {
        runId: 'run-1',
        runType: 'daily_digest',
        userRole: 'admin',
        relevantFindingCount: 2,
        resultTypeCount: 1,
      },
    })
    expect(mockQueryOne.mock.calls[1]?.[0]).toContain('INSERT INTO ai_agent_reports')
    expect(mockExecute.mock.calls.some((call) => String(call[0]).includes('UPDATE ai_agent_runs'))).toBe(true)
  })

  it('skips opted-out daily digest users before calling the model', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'user-1',
        name: 'Alex',
        email: 'alex@example.com',
        role: 'admin',
        ai_agent_preferences: { dailyDigest: false },
      },
    ])

    const result = await runAgentDigest('daily_digest')

    expect(result).toEqual({ runId: 'run-1', reportCount: 0 })
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })
})
