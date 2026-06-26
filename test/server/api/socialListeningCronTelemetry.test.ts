import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  headers?: Record<string, string>
}

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockCollectForQuery = vi.fn()
const mockUpsertMentions = vi.fn()
const mockGenerateGroqInsight = vi.fn()
const mockDispatchListeningAlerts = vi.fn()
const mockCreateNotification = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (event: TestEvent, key: string) => event.headers?.[key.toLowerCase()] ?? event.headers?.[key],
  createError: (opts: { statusCode: number, statusMessage: string }) => Object.assign(new Error(opts.statusMessage), opts),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

vi.mock('~~/server/utils/socialListening/collect', () => ({
  collectForQuery: (...args: unknown[]) => mockCollectForQuery(...args),
}))

vi.mock('~~/server/utils/socialListening/store', () => ({
  upsertMentions: (...args: unknown[]) => mockUpsertMentions(...args),
}))

vi.mock('~~/server/utils/socialListening/sources/registry', () => ({
  LISTENING_SOURCES: [],
}))

vi.mock('~~/server/utils/groqClient', () => ({ GROQ_MODELS: { LLAMA_8B: 'llama-3.1-8b-instant' } }))
vi.mock('~~/server/utils/ai/resolvedGroq', () => ({
  generateModelRoutedGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

vi.mock('~~/server/utils/socialListening/alerts', () => ({
  dispatchListeningAlerts: (...args: unknown[]) => mockDispatchListeningAlerts(...args),
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}))

const { default: handler } = await import('../../../server/api/cron/sync-social-listening.post')

describe('POST /api/cron/sync-social-listening telemetry', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test'
    mockQueryRows.mockReset()
      .mockResolvedValueOnce([
        { id: 'query-1', client_id: 'client-1', include_terms: ['acme'], exclude_terms: [], sources: ['mock'] },
      ])
      .mockResolvedValueOnce([
        { id: 'mention-1', title: 'Acme', content: 'Great support from Acme.' },
      ])
    mockQueryOne.mockReset().mockResolvedValue(null)
    mockExecute.mockReset().mockResolvedValue(1)
    mockCollectForQuery.mockReset().mockResolvedValue([{ id: 'external-1' }])
    mockUpsertMentions.mockReset().mockResolvedValue(1)
    mockGenerateGroqInsight.mockReset().mockResolvedValue('[{"id":"mention-1","sentiment":"positive","topics":["support"]}]')
    mockDispatchListeningAlerts.mockReset().mockResolvedValue({ sent: 0 })
    mockCreateNotification.mockReset().mockResolvedValue({ id: 'notification-1' })
  })

  it('records Model Ops metadata for social listening enrichment classification', async () => {
    const result = await handler({ headers: { 'x-cron-secret': 'test' } } satisfies TestEvent)

    expect(result).toEqual({
      ok: true,
      queriesRun: 1,
      mentionsUpserted: 1,
      enriched: 1,
      alerts: { sent: 0 },
    })
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('mention-1'), expect.objectContaining({
      featureKey: 'social_listening_enrichment',
      requestId: 'cron-sync-social-listening',
      metadata: {
        route: '/api/cron/sync-social-listening',
        enabledQueryCount: 1,
        queriesRun: 1,
        mentionsUpserted: 1,
        promptChars: expect.any(Number),
      },
    }))
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE social_listening_mentions'),
      ['positive', ['support'], 'mention-1'],
    )
  })
})
