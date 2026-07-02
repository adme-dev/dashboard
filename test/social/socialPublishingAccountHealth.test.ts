import { describe, expect, it } from 'vitest'
import { classifySocialPublishingAccountHealth } from '../../server/utils/socialPublishing/accountHealth'

const NOW = new Date('2026-07-02T00:00:00.000Z')

describe('social publishing account health', () => {
  it('requires reconnect when a Meta token has expired and cannot be refreshed', () => {
    const result = classifySocialPublishingAccountHealth({
      platform: 'facebook',
      isActive: true,
      tokenExpiresAt: '2026-07-01T00:00:00.000Z',
      hasRefreshToken: false,
      now: NOW
    })

    expect(result.health).toBe('reconnect')
    expect(result.requiresReconnect).toBe(true)
  })

  it('does not alarm on expired short-lived tokens when refresh is available', () => {
    const result = classifySocialPublishingAccountHealth({
      platform: 'google-business',
      isActive: true,
      tokenExpiresAt: '2026-07-01T23:00:00.000Z',
      hasRefreshToken: true,
      now: NOW
    })

    expect(result.health).toBe('healthy')
    expect(result.requiresReconnect).toBe(false)
  })

  it('keeps planned providers visible as connected but not publishing-ready', () => {
    const result = classifySocialPublishingAccountHealth({
      platform: 'tiktok',
      isActive: true,
      tokenExpiresAt: '2026-08-01T00:00:00.000Z',
      hasRefreshToken: true,
      now: NOW
    })

    expect(result.health).toBe('attention')
    expect(result.healthLabel).toBe('Publishing disabled')
    expect(result.healthReason).toContain('not production-ready')
    expect(result.requiresReconnect).toBe(false)
  })

  it('keeps expired planned providers publishing-disabled instead of asking for reconnect', () => {
    const result = classifySocialPublishingAccountHealth({
      platform: 'youtube',
      isActive: true,
      tokenExpiresAt: '2026-07-01T00:00:00.000Z',
      hasRefreshToken: false,
      now: NOW
    })

    expect(result.health).toBe('attention')
    expect(result.healthLabel).toBe('Publishing disabled')
    expect(result.healthReason).toContain('not production-ready')
    expect(result.requiresReconnect).toBe(false)
  })

  it('surfaces Meta webhook subscription gaps as attention, not reconnect', () => {
    const result = classifySocialPublishingAccountHealth({
      platform: 'facebook',
      isActive: true,
      tokenExpiresAt: '2026-08-01T00:00:00.000Z',
      metadata: { webhook_subscribed: false },
      now: NOW
    })

    expect(result.health).toBe('attention')
    expect(result.healthLabel).toBe('Webhook attention')
    expect(result.requiresReconnect).toBe(false)
  })

  it('flags linked Instagram profiles whose Facebook Page row is missing', () => {
    const result = classifySocialPublishingAccountHealth({
      platform: 'instagram',
      isActive: true,
      tokenExpiresAt: '2026-08-01T00:00:00.000Z',
      metadata: { via_page_id: 'PAGE1' },
      linkedFacebookAccountId: null,
      now: NOW
    })

    expect(result.health).toBe('attention')
    expect(result.requiresReconnect).toBe(true)
  })
})
