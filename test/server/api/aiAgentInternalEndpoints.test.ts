import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getHeader: (event: any, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getHeader = (event, name) => event.headers?.[name.toLowerCase()]
testGlobal.createError = (input) => Object.assign(new Error(input.statusMessage), input)

const mockRunAgentDigest = vi.fn()

vi.mock('~~/server/utils/aiAgentRunner', () => ({
  runAgentDigest: (...args: unknown[]) => mockRunAgentDigest(...args),
}))

const { default: dailyDigestHandler } = await import(
  '../../../../server/api/internal/ai-agent/daily-digest.post'
)
const { default: weeklyReportHandler } = await import(
  '../../../../server/api/internal/ai-agent/weekly-report.post'
)

describe('internal AI agent endpoints', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...oldEnv, INTERNAL_API_KEY: 'secret' }
    mockRunAgentDigest.mockReset()
    mockRunAgentDigest.mockResolvedValue({ runId: 'run-1', reportCount: 2 })
  })

  it('rejects missing bearer auth before running the digest', async () => {
    await expect(dailyDigestHandler({ headers: {} })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
    expect(mockRunAgentDigest).not.toHaveBeenCalled()
  })

  it('dispatches the daily digest run type', async () => {
    const result = await dailyDigestHandler({
      headers: { authorization: 'Bearer secret' },
    })

    expect(mockRunAgentDigest).toHaveBeenCalledWith('daily_digest')
    expect(result).toEqual({
      success: true,
      runId: 'run-1',
      reportCount: 2,
    })
  })

  it('dispatches the weekly report run type', async () => {
    const result = await weeklyReportHandler({
      headers: { authorization: 'Bearer secret' },
    })

    expect(mockRunAgentDigest).toHaveBeenCalledWith('weekly_report')
    expect(result).toEqual({
      success: true,
      runId: 'run-1',
      reportCount: 2,
    })
  })
})
