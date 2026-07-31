import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn()
}))

vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requirePortalSearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  queryRows: mocks.queryRows
}))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)

describe('portal Search Authority API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.requireAccess.mockResolvedValue({
      clientId: CLIENT_ID,
      clientName: 'Knox GWM Haval',
      permissions: { canViewAnalytics: true }
    })
    mocks.queryOne
      .mockResolvedValueOnce({
        connection_status: 'active',
        data_through_date: '2026-07-30',
        provisional: true
      })
      .mockResolvedValueOnce({
        clicks: '120',
        impressions: '4000',
        ctr: '0.03',
        position: '8.5',
        previous_clicks: '100',
        previous_impressions: '5000',
        coverage_days: '28',
        previous_coverage_days: '28'
      })
    mocks.queryRows.mockResolvedValue([{
      opportunity_type: 'low_ctr',
      lifecycle_status: 'task_created',
      task_id: 'task-1'
    }])
  })

  it('derives client scope and omits private agency evidence', async () => {
    const handler = (await import(
      '~~/server/api/portal/search-authority/overview.get'
    )).default
    const result = await handler({} as never)
    const serialized = JSON.stringify(result)

    expect(result.clientName).toBe('Knox GWM Haval')
    expect(result.visibility).toMatchObject({
      clicks: 120,
      impressions: 4000,
      clickChangePercent: 20,
      impressionChangePercent: -20
    })
    expect(result.actions.items[0]).toEqual({
      label: 'Search result improvement',
      status: 'task_created'
    })
    expect(serialized).not.toMatch(
      /queryText|query_text|reasonCodes|scoringVersion|connectionId|credential|baseline|weight|taskId|"id":/i
    )
    expect(mocks.queryOne.mock.calls.every(call => (
      (call[1] as unknown[])[0] === CLIENT_ID
    ))).toBe(true)
  })

  it('does not invent a percentage change from a zero comparison baseline', async () => {
    mocks.queryOne
      .mockReset()
      .mockResolvedValueOnce({
        connection_status: 'active',
        data_through_date: '2026-07-30',
        provisional: false
      })
      .mockResolvedValueOnce({
        clicks: '12',
        impressions: '100',
        ctr: '0.12',
        position: '5',
        previous_clicks: '0',
        previous_impressions: '0',
        coverage_days: '28',
        previous_coverage_days: '28'
      })

    const handler = (await import(
      '~~/server/api/portal/search-authority/overview.get'
    )).default
    const result = await handler({} as never)

    expect(result.visibility.clickChangePercent).toBeNull()
    expect(result.visibility.impressionChangePercent).toBeNull()
  })

  it('performs no data reads when portal access is denied', async () => {
    mocks.requireAccess.mockRejectedValue(
      Object.assign(new Error('Analytics access is required'), { statusCode: 403 })
    )
    const handler = (await import(
      '~~/server/api/portal/search-authority/overview.get'
    )).default

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })
})
