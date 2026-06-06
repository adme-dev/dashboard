import { describe, it, expect } from 'vitest'
import {
  chunk,
  canTransition,
  bodyHasUnsubscribe,
  canEnterSending,
  buildCampaignPreflight,
  RESEND_BATCH_LIMIT
} from '~~/server/utils/email-marketing/campaignSend'

describe('chunk', () => {
  it('splits into fixed-size groups, last group is the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('defaults to the Resend batch limit', () => {
    const items = Array.from({ length: 250 }, (_, i) => i)
    const groups = chunk(items)
    expect(groups.length).toBe(3)
    expect(groups[0].length).toBe(RESEND_BATCH_LIMIT)
    expect(groups[2].length).toBe(50)
  })

  it('returns empty for an empty array and throws on size < 1', () => {
    expect(chunk([], 10)).toEqual([])
    expect(() => chunk([1], 0)).toThrow()
  })
})

describe('canTransition', () => {
  it('allows draft → sending and sending → paused/sent/cancelled', () => {
    expect(canTransition('draft', 'sending')).toBe(true)
    expect(canTransition('sending', 'paused')).toBe(true)
    expect(canTransition('sending', 'sent')).toBe(true)
    expect(canTransition('paused', 'sending')).toBe(true)
  })

  it('rejects terminal and illegal transitions', () => {
    expect(canTransition('sent', 'sending')).toBe(false)
    expect(canTransition('cancelled', 'draft')).toBe(false)
    expect(canTransition('draft', 'paused')).toBe(false)
  })
})

describe('bodyHasUnsubscribe', () => {
  it('detects the merge tag (with or without spaces)', () => {
    expect(bodyHasUnsubscribe('<p>{{unsubscribe_url}}</p>')).toBe(true)
    expect(bodyHasUnsubscribe('<a href="{{ unsubscribe_url }}">x</a>')).toBe(true)
  })

  it('detects a literal unsubscribe href', () => {
    expect(bodyHasUnsubscribe('<a href="https://x.com/unsubscribe?t=1">stop</a>')).toBe(true)
  })

  it('is false when absent / empty', () => {
    expect(bodyHasUnsubscribe('<p>hello</p>')).toBe(false)
    expect(bodyHasUnsubscribe('')).toBe(false)
    expect(bodyHasUnsubscribe(null)).toBe(false)
  })
})

describe('canEnterSending', () => {
  const goodBody = '<p>hi {{ unsubscribe_url }}</p>'

  it('passes a draft with recipients + unsubscribe link', () => {
    expect(canEnterSending({ status: 'draft', toSend: 10, bodyHtml: goodBody }))
      .toEqual({ ok: true })
  })

  it('blocks when no recipients', () => {
    const r = canEnterSending({ status: 'draft', toSend: 0, bodyHtml: goodBody })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/recipients/)
  })

  it('blocks when body has no unsubscribe link', () => {
    const r = canEnterSending({ status: 'draft', toSend: 10, bodyHtml: '<p>no opt out</p>' })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/unsubscribe/)
  })

  it('blocks from a terminal status', () => {
    const r = canEnterSending({ status: 'sent', toSend: 10, bodyHtml: goodBody })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/cannot send/)
  })
})

describe('buildCampaignPreflight', () => {
  const cleanCampaign = {
    subject: 'June offers',
    from_email: 'sales@example.com',
    body_html: [
      '<!doctype html><html><body>',
      '<p>Latest offer</p>',
      '<img src="https://cdn.example.com/car.png">',
      '<a href="{{ unsubscribe_url }}">Unsubscribe</a>',
      '<footer>XeroFlow Agency, 1 Market Street, Melbourne VIC 3000</footer>',
      '</body></html>'
    ].join('')
  }

  it('returns structured passing checks for a sendable campaign', () => {
    const result = buildCampaignPreflight({
      campaign: cleanCampaign,
      toSend: 42,
      sendingConfigured: true,
      senderDomainAuthenticated: true
    })

    expect(result.ok).toBe(true)
    expect(result.blocked).toBe(false)
    expect(result.recipientCount).toBe(42)
    expect(result.checks.map(check => check.code)).toEqual([
      'unsubscribe',
      'sender',
      'auth_readiness',
      'media_urls',
      'html_size',
      'footer_identity'
    ])
    expect(result.checks.map(check => check.label)).toEqual([
      'Unsubscribe',
      'Sender',
      'Authentication readiness',
      'Media URLs',
      'HTML size',
      'Footer identity'
    ])
    expect(result.checks.every(check => check.status === 'pass')).toBe(true)
  })

  it('surfaces blocked checks and warnings for unsafe campaign state', () => {
    const result = buildCampaignPreflight({
      campaign: {
        subject: '',
        from_email: null,
        body_html: `<p>Hello</p><img src="/asset.png">${'x'.repeat(110 * 1024)}`
      },
      toSend: 0,
      sendingConfigured: false,
      senderDomainAuthenticated: false
    })

    expect(result.ok).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsubscribe', status: 'blocked' }),
      expect.objectContaining({ code: 'sender', status: 'blocked' }),
      expect.objectContaining({ code: 'auth_readiness', status: 'blocked' }),
      expect.objectContaining({ code: 'media_urls', status: 'warning' }),
      expect.objectContaining({ code: 'html_size', status: 'warning' }),
      expect.objectContaining({ code: 'footer_identity', status: 'blocked' })
    ]))
    expect(result.checks.find(check => check.code === 'recipients')).toEqual(
      expect.objectContaining({ status: 'blocked' })
    )
  })

  it('blocks otherwise sendable campaigns without a physical sender identity footer', () => {
    const result = buildCampaignPreflight({
      campaign: {
        subject: 'June offers',
        from_email: 'sales@example.com',
        body_html: [
          '<p>Latest offer</p>',
          '<img src="https://cdn.example.com/car.png">',
          '<a href="{{ unsubscribe_url }}">Unsubscribe</a>',
          '<footer>Thanks for reading</footer>'
        ].join('')
      },
      toSend: 42,
      sendingConfigured: true,
      senderDomainAuthenticated: true
    })

    expect(result.ok).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.checks.find(check => check.code === 'footer_identity')).toEqual(
      expect.objectContaining({
        status: 'blocked',
        message: expect.stringMatching(/physical sender identity/i)
      })
    )
  })

  it('blocks auth readiness when the From domain is not in the allowed sender domains', () => {
    const result = buildCampaignPreflight({
      campaign: cleanCampaign,
      toSend: 42,
      sendingConfigured: true,
      senderDomainAuthenticated: true,
      allowedSenderDomains: ['adme.net.au']
    })

    expect(result.ok).toBe(false)
    expect(result.checks.find(check => check.code === 'auth_readiness')).toEqual(
      expect.objectContaining({
        status: 'blocked',
        value: false
      })
    )
  })
})
