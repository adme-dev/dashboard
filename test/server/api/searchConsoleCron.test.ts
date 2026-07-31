import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clientIds: ['client-entitled'] as string[],
  listClientIds: vi.fn(),
  syncClient: vi.fn(),
  generateOpportunities: vi.fn(),
  inspect: vi.fn(),
  opportunityWindow: vi.fn(),
  runAfterResponse: vi.fn()
}))

vi.mock('~~/server/utils/searchAuthority/feature', () => ({
  listSearchAuthorityClientIds: mocks.listClientIds
}))
vi.mock('~~/server/utils/searchAuthority/sync', () => ({
  syncSearchConsoleClient: mocks.syncClient
}))
vi.mock('~~/server/utils/searchAuthority/opportunities', () => ({
  generateSearchAuthorityOpportunities: mocks.generateOpportunities
}))
vi.mock('~~/server/utils/searchAuthority/dates', () => ({
  searchConsoleOpportunityWindow: mocks.opportunityWindow
}))
vi.mock('~~/server/utils/searchAuthority/inspection', () => ({
  inspectPriorityUrls: mocks.inspect
}))
vi.mock('~~/server/utils/asyncBackground', () => ({
  runAfterResponse: mocks.runAfterResponse
}))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getHeader', (event: { headers?: Record<string, string> }, name: string) => (
  event.headers?.[name]
))

describe('Search Console daily cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-secret'
    mocks.listClientIds.mockResolvedValue(mocks.clientIds)
    mocks.syncClient.mockResolvedValue([{ status: 'succeeded' }])
    mocks.generateOpportunities.mockResolvedValue({
      generated: 2,
      fingerprints: ['one', 'two']
    })
    mocks.inspect.mockResolvedValue({ inspected: 1, failed: 0, errors: [] })
    mocks.opportunityWindow.mockReturnValue({
      startDate: '2026-07-04',
      endDate: '2026-07-31'
    })
    mocks.runAfterResponse.mockImplementation((_event, promise) => promise)
  })

  it('fails closed without the cron secret', async () => {
    const handler = (await import(
      '~~/server/api/cron/search-console-sync.post'
    )).default
    await expect(handler({ headers: {}, context: {} } as never)).rejects.toMatchObject({
      statusCode: 401
    })
    expect(mocks.listClientIds).not.toHaveBeenCalled()
  })

  it('queues refresh and indexed-version inspection only for entitled active clients', async () => {
    const handler = (await import(
      '~~/server/api/cron/search-console-sync.post'
    )).default
    const event = {
      headers: { 'x-cron-secret': 'cron-secret' },
      context: {}
    } as never
    const result = await handler(event)

    expect(result).toEqual({ ok: true, queuedClients: 1 })
    expect(mocks.runAfterResponse).toHaveBeenCalledOnce()
    await mocks.runAfterResponse.mock.calls[0]![1]
    expect(mocks.syncClient).toHaveBeenCalledWith({
      clientId: 'client-entitled',
      triggerType: 'scheduled'
    })
    expect(mocks.generateOpportunities).toHaveBeenCalledWith(
      'client-entitled',
      { startDate: '2026-07-04', endDate: '2026-07-31' }
    )
    expect(mocks.inspect).toHaveBeenCalledWith('client-entitled', 50)
    expect(mocks.syncClient.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generateOpportunities.mock.invocationCallOrder[0]!
    )
    expect(mocks.generateOpportunities.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.inspect.mock.invocationCallOrder[0]!
    )
  })

  it('does not generate opportunities from partial or missing sync evidence', async () => {
    mocks.syncClient.mockResolvedValue([{ status: 'partial' }])
    const handler = (await import(
      '~~/server/api/cron/search-console-sync.post'
    )).default
    await handler({
      headers: { 'x-cron-secret': 'cron-secret' },
      context: {}
    } as never)

    await mocks.runAfterResponse.mock.calls[0]![1]
    expect(mocks.generateOpportunities).not.toHaveBeenCalled()
    expect(mocks.inspect).toHaveBeenCalledWith('client-entitled', 50)
  })
})
