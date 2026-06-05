import { describe, expect, it } from 'vitest'
import { classifyEmailClick } from '~~/server/utils/email-marketing/clickClassifier'

describe('classifyEmailClick', () => {
  it('tags known email security scanner user agents', () => {
    const result = classifyEmailClick({
      userAgent: 'Mozilla/5.0 Proofpoint URL Defense'
    })

    expect(result.suspectedScanner).toBe(true)
    expect(result.reasons).toContain('scanner_user_agent')
  })

  it('tags impossible post-send timing as suspected scanner activity', () => {
    const result = classifyEmailClick({
      userAgent: 'Mozilla/5.0',
      sentAt: '2026-06-05T00:00:00.000Z',
      clickedAt: '2026-06-05T00:00:02.000Z'
    })

    expect(result.suspectedScanner).toBe(true)
    expect(result.reasons).toContain('impossible_timing')
  })

  it('treats normal browser clicks after a plausible delay as human by default', () => {
    const result = classifyEmailClick({
      userAgent: 'Mozilla/5.0 AppleWebKit/605.1.15 Safari/605.1.15',
      sentAt: '2026-06-05T00:00:00.000Z',
      clickedAt: '2026-06-05T00:05:00.000Z'
    })

    expect(result).toEqual({ suspectedScanner: false, reasons: [] })
  })
})
