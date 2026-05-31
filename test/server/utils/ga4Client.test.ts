import { describe, it, expect } from 'vitest'
import {
  ga4BackoffMs,
  quotaShouldThrottle,
  isRetryableGa4Error,
  withGa4Retry,
  buildGa4DimensionRequest,
  buildGa4EventRequest,
  parseGa4DimensionReport,
  parseGa4EventReport
} from '~~/server/utils/ga4Client'

describe('ga4BackoffMs', () => {
  it('grows exponentially and applies 50–100% jitter', () => {
    // rand=0 → 50% of exp; rand=1 → 100% of exp
    expect(ga4BackoffMs(0, { baseMs: 500, rand: () => 0 })).toBe(250)
    expect(ga4BackoffMs(0, { baseMs: 500, rand: () => 1 })).toBe(500)
    expect(ga4BackoffMs(1, { baseMs: 500, rand: () => 1 })).toBe(1000)
    expect(ga4BackoffMs(2, { baseMs: 500, rand: () => 1 })).toBe(2000)
  })

  it('caps the exponential term', () => {
    expect(ga4BackoffMs(20, { baseMs: 500, capMs: 30_000, rand: () => 1 })).toBe(30_000)
  })
})

describe('quotaShouldThrottle', () => {
  it('throttles when an hourly bucket drops below the safety fraction', () => {
    expect(quotaShouldThrottle({ tokensPerHour: { consumed: 95, remaining: 5 } })).toBe(true)
  })
  it('does not throttle with healthy remaining quota', () => {
    expect(quotaShouldThrottle({ tokensPerHour: { consumed: 50, remaining: 50 } })).toBe(false)
  })
  it('is safe with undefined quota', () => {
    expect(quotaShouldThrottle(undefined)).toBe(false)
  })
})

describe('isRetryableGa4Error', () => {
  it('retries 429 and 5xx, not 4xx (except 429) or unknown', () => {
    expect(isRetryableGa4Error({ status: 429 })).toBe(true)
    expect(isRetryableGa4Error({ response: { status: 503 } })).toBe(true)
    expect(isRetryableGa4Error({ status: 400 })).toBe(false)
    expect(isRetryableGa4Error({ status: 403 })).toBe(false)
    expect(isRetryableGa4Error(new Error('boom'))).toBe(false)
  })
})

describe('withGa4Retry', () => {
  it('retries a retryable error then succeeds', async () => {
    let calls = 0
    const out = await withGa4Retry(async () => {
      calls++
      if (calls < 3) throw { status: 503 }
      return 'ok'
    }, { sleep: async () => {}, rand: () => 0 })
    expect(out).toBe('ok')
    expect(calls).toBe(3)
  })

  it('gives up after `retries` and rethrows', async () => {
    let calls = 0
    await expect(withGa4Retry(async () => {
      calls++
      throw { status: 429 }
    }, { retries: 2, sleep: async () => {}, rand: () => 0 })).rejects.toEqual({ status: 429 })
    expect(calls).toBe(3) // initial + 2 retries
  })

  it('does not retry a non-retryable error', async () => {
    let calls = 0
    await expect(withGa4Retry(async () => {
      calls++
      throw { status: 400 }
    }, { sleep: async () => {} })).rejects.toEqual({ status: 400 })
    expect(calls).toBe(1)
  })
})

describe('buildGa4DimensionRequest', () => {
  it('maps the dimension type to the GA4 API dimension and requests quota', () => {
    const req = buildGa4DimensionRequest('sourceMedium', '2026-05-01', '2026-05-07')
    expect(req.dimensions).toEqual([{ name: 'date' }, { name: 'sessionSourceMedium' }])
    expect(req.dateRanges).toEqual([{ startDate: '2026-05-01', endDate: '2026-05-07' }])
    expect(req.returnPropertyQuota).toBe(true)
  })
  it('builds the event request with eventName + count/value', () => {
    const req = buildGa4EventRequest('2026-05-01', '2026-05-07')
    expect(req.dimensions).toEqual([{ name: 'date' }, { name: 'eventName' }])
    expect(req.metrics).toEqual([{ name: 'eventCount' }, { name: 'eventValue' }])
  })
})

describe('parseGa4DimensionReport', () => {
  it('parses date + dimension value + metrics in order', () => {
    const rows = parseGa4DimensionReport({
      rows: [{
        dimensionValues: [{ value: '20260507' }, { value: 'google / cpc' }],
        metricValues: [{ value: '120' }, { value: '90' }, { value: '60' }, { value: '80' }, { value: '0.66' }, { value: '45.2' }, { value: '12' }, { value: '0' }]
      }]
    })
    expect(rows[0]).toMatchObject({ date: '2026-05-07', dimensionValue: 'google / cpc', sessions: 120, keyEvents: 12 })
  })
  it('defaults a missing dimension value to (not set)', () => {
    const rows = parseGa4DimensionReport({ rows: [{ dimensionValues: [{ value: '20260507' }], metricValues: [] }] })
    expect(rows[0].dimensionValue).toBe('(not set)')
    expect(rows[0].sessions).toBe(0)
  })
})

describe('parseGa4EventReport', () => {
  it('parses event name + count + value', () => {
    const rows = parseGa4EventReport({
      rows: [{ dimensionValues: [{ value: '20260507' }, { value: 'generate_lead' }], metricValues: [{ value: '7' }, { value: '350' }] }]
    })
    expect(rows[0]).toEqual({ date: '2026-05-07', eventName: 'generate_lead', eventCount: 7, eventValue: 350 })
  })
})
