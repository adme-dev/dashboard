import { describe, expect, it, vi } from 'vitest'
import {
  buildSocialInboxAnalyticsBreakdownQuery,
  buildSocialInboxAnalyticsSummaryQuery,
  getSocialInboxAnalytics,
  mapSocialInboxAnalytics
} from '~~/server/utils/socialInbox/analytics'

describe('social inbox analytics', () => {
  it('builds summary SQL for SLA and native-work conversion metrics', () => {
    const q = buildSocialInboxAnalyticsSummaryQuery({ clientId: 'client-1', days: 30 })

    expect(q.params).toEqual(['client-1', 30])
    expect(q.sql).toMatch(/linked_task_id IS NOT NULL OR linked_client_request_id IS NOT NULL/)
    expect(q.sql).toMatch(/linked_task_id IS NOT NULL\)::int AS linked_tasks/)
    expect(q.sql).toMatch(/linked_client_request_id IS NOT NULL\)::int AS linked_client_requests/)
    expect(q.sql).toMatch(/sla_due_at <= NOW\(\) \+ INTERVAL '24 hours'/)
    expect(q.sql).toMatch(/first_response_at IS NULL\s+AND sla_due_at < NOW\(\)/)
  })

  it('builds platform and channel breakdown SQL without changing the route contract', () => {
    const byChannel = buildSocialInboxAnalyticsBreakdownQuery({ clientId: 'client-1', days: 14 }, 'channel_type')
    const byPlatform = buildSocialInboxAnalyticsBreakdownQuery({ clientId: 'client-1', days: 14 }, 'platform')

    expect(byChannel.params).toEqual(['client-1', 14])
    expect(byChannel.sql).toMatch(/SELECT\s+channel_type AS key/i)
    expect(byChannel.sql).toMatch(/GROUP BY channel_type/)
    expect(byPlatform.sql).toMatch(/SELECT\s+platform AS key/i)
    expect(byPlatform.sql).toMatch(/GROUP BY platform/)
  })

  it('maps SQL rows into rates and zero-safe breakdowns', () => {
    const analytics = mapSocialInboxAnalytics(
      {
        total: '10',
        open_count: '3',
        closed_count: '4',
        responded: '8',
        sla_tracked: '9',
        breaches: '2',
        within_sla: '7',
        due_soon: '1',
        overdue_open: '2',
        linked_tasks: '3',
        linked_client_requests: '2',
        converted: '4',
        avg_first_response_minutes: '23'
      },
      { auto: '2', sent: '5' },
      [
        {
          key: 'comment',
          total: '6',
          open_count: '2',
          responded: '5',
          sla_tracked: '5',
          breaches: '1',
          within_sla: '4',
          converted: '3',
          avg_first_response_minutes: '18'
        }
      ],
      [
        {
          key: 'facebook',
          total: '0',
          open_count: '0',
          responded: '0',
          sla_tracked: '0',
          breaches: '0',
          within_sla: '0',
          converted: '0',
          avg_first_response_minutes: null
        }
      ]
    )

    expect(analytics).toMatchObject({
      total: 10,
      open: 3,
      closed: 4,
      responded: 8,
      slaTracked: 9,
      breaches: 2,
      dueSoon: 1,
      overdueOpen: 2,
      linkedTasks: 3,
      linkedClientRequests: 2,
      converted: 4,
      conversionRatePct: 40,
      withinSlaPct: 78,
      automationRatePct: 40
    })
    expect(analytics.byChannel[0]).toMatchObject({ key: 'comment', total: 6, converted: 3, conversionRatePct: 50, withinSlaPct: 80 })
    expect(analytics.byPlatform[0]).toMatchObject({ key: 'facebook', total: 0, conversionRatePct: 0, withinSlaPct: null })
  })

  it('clamps the reporting window and reads summary, automation, and breakdown rows', async () => {
    const db = {
      queryOne: vi.fn(async (sql: string) => {
        if (/FROM social_response_queue/.test(sql)) return { auto: 1, sent: 4 }
        return { total: 1, open_count: 1, closed_count: 0, responded: 0, sla_tracked: 0, breaches: 0, within_sla: 0, due_soon: 0, overdue_open: 0, linked_tasks: 1, linked_client_requests: 0, converted: 1, avg_first_response_minutes: 0 }
      }),
      queryRows: vi.fn(async () => [])
    }

    const analytics = await getSocialInboxAnalytics(db, { clientId: 'client-1', days: 999 })

    expect(db.queryOne.mock.calls[0][1]).toEqual(['client-1', 365])
    expect(db.queryRows).toHaveBeenCalledTimes(2)
    expect(analytics.conversionRatePct).toBe(100)
  })
})
