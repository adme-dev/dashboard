import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  headers?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getHeader: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getHeader = (event, key) => event.headers?.[key.toLowerCase()]
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockQueryRows = vi.fn()
const mockEnsureOfficeAssistantEvaluatorTables = vi.fn()
const mockEvaluateOfficeAssistantWatches = vi.fn()
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeAssistantEvaluator', () => ({
  ensureOfficeAssistantEvaluatorTables: (...args: unknown[]) => mockEnsureOfficeAssistantEvaluatorTables(...args),
  evaluateOfficeAssistantWatches: (...args: unknown[]) => mockEvaluateOfficeAssistantWatches(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/cron/office-assistant.post'
)

function fakeEvent(secret = 'secret') {
  return {
    headers: { 'x-cron-secret': secret }
  } satisfies TestEvent
}

describe('POST /api/cron/office-assistant', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'secret')
    consoleErrorSpy.mockClear()
    mockQueryRows.mockReset()
    mockEnsureOfficeAssistantEvaluatorTables.mockReset()
    mockEvaluateOfficeAssistantWatches.mockReset()

    mockEnsureOfficeAssistantEvaluatorTables.mockResolvedValue(undefined)
    mockQueryRows.mockResolvedValue([{ office_id: 'office-1' }, { office_id: 'office-2' }])
    mockEvaluateOfficeAssistantWatches
      .mockResolvedValueOnce({ evaluated: 2, triggered: [{ id: 'job-1' }] })
      .mockResolvedValueOnce({ evaluated: 1, triggered: [] })
  })

  it('evaluates due watches for each office', async () => {
    const result = await handler(fakeEvent())

    expect(result).toMatchObject({
      ok: true,
      offices: 2,
      evaluated: 3,
      triggered: 1
    })
    expect(mockEnsureOfficeAssistantEvaluatorTables).toHaveBeenCalled()
    expect(mockEvaluateOfficeAssistantWatches).toHaveBeenNthCalledWith(1, {
      officeId: 'office-1',
      limit: 100
    })
    expect(mockEvaluateOfficeAssistantWatches).toHaveBeenNthCalledWith(2, {
      officeId: 'office-2',
      limit: 100
    })
  })

  it('continues when one office fails', async () => {
    mockEvaluateOfficeAssistantWatches
      .mockReset()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ evaluated: 1, triggered: [] })

    const result = await handler(fakeEvent())

    expect(result).toMatchObject({
      ok: true,
      offices: 2,
      evaluated: 1,
      triggered: 0
    })
    expect(result.results[0]).toMatchObject({ officeId: 'office-1', error: 'evaluation_failed' })
  })
})
