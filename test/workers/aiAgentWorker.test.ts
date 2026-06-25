import { describe, expect, it, vi } from 'vitest'
import {
  endpointForRunType,
  selectScheduledRunType,
  triggerAgentRun,
} from '../../workers/ai-agent-worker/src/index'

describe('ai-agent-worker scheduler', () => {
  it('selects weekly report only on Sunday 22:00 UTC', () => {
    expect(selectScheduledRunType(new Date('2026-06-28T22:00:00.000Z'))).toBe('weekly_report')
    expect(selectScheduledRunType(new Date('2026-06-28T21:00:00.000Z'))).toBe('daily_digest')
    expect(selectScheduledRunType(new Date('2026-06-29T22:00:00.000Z'))).toBe('daily_digest')
  })

  it('maps run types to internal app endpoints', () => {
    expect(endpointForRunType('daily_digest')).toBe('daily-digest')
    expect(endpointForRunType('weekly_report')).toBe('weekly-report')
  })

  it('triggers the app-controlled daily digest endpoint with bearer auth', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      runId: 'run-1',
      reportCount: 3,
    }), { status: 200 }))

    const result = await triggerAgentRun({
      API_URL: 'https://app.xeroflow.io/',
      INTERNAL_API_KEY: 'secret',
    }, 'daily_digest', fetcher as any)

    expect(fetcher).toHaveBeenCalledWith('https://app.xeroflow.io/api/internal/ai-agent/daily-digest', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
    })
    expect(result).toEqual({ runId: 'run-1', reportCount: 3 })
  })

  it('surfaces non-OK internal endpoint responses as errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }))

    await expect(triggerAgentRun({
      API_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret',
    }, 'weekly_report', fetcher as any)).rejects.toThrow('weekly_report failed (500): nope')
  })
})
