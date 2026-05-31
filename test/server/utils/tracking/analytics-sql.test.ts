import { describe, it, expect } from 'vitest'
import {
  classifyPaidOrganic, classifyUserAgent, numericJsonb, dayBucketExpr, NOISE_SQL
} from '../../../../server/utils/tracking/analytics-sql'

describe('classifyPaidOrganic', () => {
  it('paid when a click id is present', () => {
    expect(classifyPaidOrganic({ gclid: 'G', utm_source: null, referrer: null })).toBe('paid')
    expect(classifyPaidOrganic({ fbclid: 'F' } as any)).toBe('paid')
  })
  it('organic when a utm_source or referrer is present but no click id', () => {
    expect(classifyPaidOrganic({ utm_source: 'google' } as any)).toBe('organic')
    expect(classifyPaidOrganic({ referrer: 'https://news.com' } as any)).toBe('organic')
  })
  it('direct when nothing is present', () => {
    expect(classifyPaidOrganic({} as any)).toBe('direct')
  })
})

describe('classifyUserAgent', () => {
  it('detects mobile', () => {
    expect(classifyUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari').device).toBe('mobile')
  })
  it('detects tablet', () => {
    expect(classifyUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari').device).toBe('tablet')
  })
  it('defaults to desktop', () => {
    expect(classifyUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/120').device).toBe('desktop')
  })
  it('extracts a browser family', () => {
    expect(classifyUserAgent('... Chrome/120 ...').browser).toBe('Chrome')
    expect(classifyUserAgent('... Firefox/121 ...').browser).toBe('Firefox')
  })
  it('handles null', () => {
    expect(classifyUserAgent(null).device).toBe('unknown')
  })
})

describe('numericJsonb', () => {
  it('builds a regex-guarded numeric cast (no throw on non-numeric)', () => {
    expect(numericJsonb('duration')).toContain('event_data->>\'duration\'')
    expect(numericJsonb('duration')).toContain('~')
  })
})

describe('dayBucketExpr', () => {
  it('buckets by the tz param as a local date', () => {
    expect(dayBucketExpr('$4')).toBe('(e.received_at AT TIME ZONE $4)::date')
  })
})

describe('NOISE_SQL', () => {
  it('excludes dead_click and bot UAs', () => {
    expect(NOISE_SQL).toContain('event_name <> \'dead_click\'')
    expect(NOISE_SQL.toLowerCase()).toContain('bot')
  })
})
