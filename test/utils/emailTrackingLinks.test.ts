import { describe, expect, it } from 'vitest'
import {
  appendEmailUtm,
  buildEmailClickUrl,
  rewriteHtmlLinksForTracking,
  verifyEmailClickToken
} from '~~/server/utils/email-marketing/trackingLinks'

describe('email tracking links', () => {
  const context = {
    appUrl: 'https://app.test/',
    campaignId: 'camp-1',
    subscriberId: 'sub-1'
  }

  it('builds a signed first-party click URL and verifies the destination', async () => {
    const link = await buildEmailClickUrl({
      ...context,
      destinationUrl: 'https://dealer.example.com/offers?model=eclipse',
      secret: 'secret'
    })
    const url = new URL(link)

    expect(url.origin + url.pathname).toBe('https://app.test/email/click')
    expect(url.searchParams.get('c')).toBe('camp-1')
    expect(url.searchParams.get('s')).toBe('sub-1')
    expect(url.searchParams.get('u')).toBe('https://dealer.example.com/offers?model=eclipse')
    expect(await verifyEmailClickToken({
      campaignId: 'camp-1',
      subscriberId: 'sub-1',
      destinationUrl: 'https://dealer.example.com/offers?model=eclipse',
      token: url.searchParams.get('t'),
      secret: 'secret'
    })).toBe(true)
  })

  it('appends stable email attribution without overwriting existing UTM values', () => {
    expect(appendEmailUtm('https://dealer.example.com/offers?utm_source=partner', 'camp-1'))
      .toBe('https://dealer.example.com/offers?utm_source=partner&utm_medium=email&utm_campaign=camp-1')
  })

  it('appends email click IDs for website attribution joins without overwriting an existing value', () => {
    expect(appendEmailUtm('https://dealer.example.com/offers', 'camp-1', 'click-1'))
      .toBe('https://dealer.example.com/offers?utm_source=email&utm_medium=email&utm_campaign=camp-1&email_click_id=click-1')
    expect(appendEmailUtm('https://dealer.example.com/offers?email_click_id=existing', 'camp-1', 'click-1'))
      .toContain('email_click_id=existing')
  })

  it('rewrites only trackable links and skips unsubscribe, mailto, tel, and anchors', async () => {
    const html = [
      '<a href="https://dealer.example.com/offers">Offer</a>',
      '<a href="{{ unsubscribe_url }}">Unsubscribe</a>',
      '<a href="mailto:sales@example.com">Email</a>',
      '<a href="tel:+61000000000">Call</a>',
      '<a href="#terms">Terms</a>'
    ].join('')

    const rewritten = await rewriteHtmlLinksForTracking(html, {
      ...context,
      secret: 'secret'
    })

    expect(rewritten).toContain('href="https://app.test/email/click?')
    expect(rewritten).toContain('u=https%3A%2F%2Fdealer.example.com%2Foffers')
    expect(rewritten).toContain('href="{{ unsubscribe_url }}"')
    expect(rewritten).toContain('href="mailto:sales@example.com"')
    expect(rewritten).toContain('href="tel:+61000000000"')
    expect(rewritten).toContain('href="#terms"')
  })
})
