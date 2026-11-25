export interface LeadWebhookSnippetParams {
  baseUrl?: string
  urlToken?: string
  secretKey?: string
  revealSecret?: boolean
}

const DEFAULT_BASE_URL = 'https://app.xeroflow.io'

function cleanBaseUrl(baseUrl?: string): string {
  const trimmed = baseUrl?.trim()
  return (trimmed || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function cleanToken(urlToken?: string): string {
  const trimmed = urlToken?.trim()
  return trimmed || '<token>'
}

function safeSecretValue(secretKey?: string, revealSecret = false): string {
  if (!revealSecret) return '<secret_key>'
  const trimmed = secretKey?.trim()
  return trimmed || '<secret_key>'
}

export function renderGoogleLeadWebhookUrl(baseUrl: string, urlToken: string): string {
  const token = urlToken.trim()
  if (!token) return ''
  return `${cleanBaseUrl(baseUrl)}/api/leads/webhook/google/${token}`
}

export function renderGenericLeadWebhookUrl(baseUrl: string, urlToken: string): string {
  const token = urlToken.trim()
  if (!token) return ''
  return `${cleanBaseUrl(baseUrl)}/api/leads/webhook/generic/${token}`
}

export function renderGenericLeadPayloadExample(params: { secretKey?: string, revealSecret?: boolean } = {}): string {
  return JSON.stringify({
    key: safeSecretValue(params.secretKey, params.revealSecret),
    lead_id: 'abc-123',
    form_id: 'newsletter-signup',
    form_name: 'Newsletter',
    source: 'webhook',
    fields: {
      full_name: 'Sarah Mitchell',
      email: 'sarah@example.com',
      phone_number: '+61404123456',
      budget: '75000'
    },
    attribution: {
      utm_source: 'newsletter',
      utm_campaign: 'spring-sale'
    }
  }, null, 2)
}

/**
 * Renders a ready-to-run curl test snippet for the generic lead webhook.
 * Never embeds the live secret key unless revealSecret is explicitly true.
 */
export function renderGenericLeadCurlSnippet(params: LeadWebhookSnippetParams = {}): string {
  const url = `${cleanBaseUrl(params.baseUrl)}/api/leads/webhook/generic/${cleanToken(params.urlToken)}`
  const key = safeSecretValue(params.secretKey, params.revealSecret).replace(/'/g, '\'\\\'\'')
  return [
    'curl -X POST \\',
    `  ${url} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{`,
    `    "key": "${key}",`,
    `    "fields": { "full_name": "Test", "email": "t@example.com" }`,
    `  }'`
  ].join('\n')
}
