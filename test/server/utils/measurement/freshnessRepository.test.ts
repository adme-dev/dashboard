import { describe, expect, it, vi } from 'vitest'
import { createMeasurementFreshnessRepository } from '~~/server/utils/measurement/freshnessRepository'

describe('measurement freshness repository', () => {
  it('returns five independent streams and never substitutes one stream for another', async () => {
    const queryRows = vi.fn()
      .mockResolvedValueOnce([{
        stream: 'conversion_actions',
        last_attempt_at: '2026-09-02T04:00:00.000Z',
        last_success_at: '2026-09-02T04:00:00.000Z',
        requested_start_date: null,
        requested_end_date: null,
        covered_start_date: null,
        covered_end_date: null,
        current_job_state: 'completed',
        unavailable_reason_code: null
      }])
      .mockResolvedValueOnce([{
        stream: 'website_events',
        last_attempt_at: '2026-09-02T03:00:00.000Z',
        last_success_at: '2026-09-02T03:00:00.000Z',
        current_job_state: 'completed'
      }])
    const repository = createMeasurementFreshnessRepository({ queryRows })

    const result = await repository.list({
      clientId: 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0',
      now: new Date('2026-09-02T05:00:00.000Z')
    })

    expect(result.streams.map(item => item.stream)).toEqual([
      'spend', 'campaign_conversions', 'conversion_actions', 'website_events', 'provider_calls'
    ])
    expect(result.streams.find(item => item.stream === 'conversion_actions')?.status).toBe('fresh')
    expect(result.streams.find(item => item.stream === 'website_events')?.status).toBe('fresh')
    expect(result.streams.find(item => item.stream === 'spend')?.status).toBe('unavailable')
    expect(queryRows.mock.calls.every((call: unknown[]) => (call[1] as unknown[])[0]
      === 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0')).toBe(true)
  })
})
