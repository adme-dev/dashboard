import { describe, expect, it } from 'vitest'
import {
  renderGenericLeadCurlSnippet,
  renderGenericLeadPayloadExample,
  renderGenericLeadWebhookUrl,
  renderGoogleLeadWebhookUrl
} from '~~/shared/leads/leadCopybook'

describe('lead webhook copybook snippets', () => {
  it('renders clean Google and generic webhook URLs without double slashes', () => {
    expect(renderGoogleLeadWebhookUrl('https://app.xeroflow.io/', 'tok-123')).toBe(
      'https://app.xeroflow.io/api/leads/webhook/google/tok-123'
    )
    expect(renderGenericLeadWebhookUrl('https://app.xeroflow.io/', 'tok-123')).toBe(
      'https://app.xeroflow.io/api/leads/webhook/generic/tok-123'
    )
    expect(renderGoogleLeadWebhookUrl('https://app.xeroflow.io', '')).toBe('')
    expect(renderGenericLeadWebhookUrl('https://app.xeroflow.io', '')).toBe('')
  })

  it('keeps secret keys masked by default and only embeds them when explicitly revealed', () => {
    const maskedCurl = renderGenericLeadCurlSnippet({
      baseUrl: 'https://app.xeroflow.io',
      urlToken: 'tok-123',
      secretKey: 'super-secret-live-key',
      revealSecret: false
    })
    expect(maskedCurl).toContain('https://app.xeroflow.io/api/leads/webhook/generic/tok-123')
    expect(maskedCurl).toContain('"key": "<secret_key>"')
    expect(maskedCurl).not.toContain('super-secret-live-key')

    const revealedCurl = renderGenericLeadCurlSnippet({
      baseUrl: 'https://app.xeroflow.io',
      urlToken: 'tok-123',
      secretKey: 'super-secret-live-key',
      revealSecret: true
    })
    expect(revealedCurl).toContain('"key": "super-secret-live-key"')
  })

  it('renders a valid JSON generic payload example matching the webhook contract', () => {
    const raw = renderGenericLeadPayloadExample({ secretKey: 'ignored', revealSecret: false })
    expect(raw).not.toContain('ignored')
    const parsed = JSON.parse(raw)
    expect(parsed).toMatchObject({
      key: '<secret_key>',
      source: 'webhook',
      fields: {
        full_name: 'Sarah Mitchell',
        email: 'sarah@example.com'
      }
    })
  })
})
