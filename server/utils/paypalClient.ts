export type PayPalEnvironment = 'sandbox' | 'live'

export interface PayPalEndpoints {
  apiBaseUrl: string
  tokenUrl: string
}

export interface PayPalResolvedConfig {
  clientId: string
  clientSecret: string
  environment: PayPalEnvironment
  configured: boolean
  endpoints: PayPalEndpoints
}

export interface PayPalTokenResult {
  accessToken: string
  tokenType: string
  appId: string | null
  scopes: string[]
  tokenExpiresAt: string
}

type PayPalRuntimeConfig = {
  paypalClientId?: string
  paypalClientSecret?: string
  paypalEnvironment?: string
}

export function normalizePayPalEnvironment(value?: string): PayPalEnvironment {
  return value === 'live' ? 'live' : 'sandbox'
}

export function getPayPalEndpoints(environment: PayPalEnvironment): PayPalEndpoints {
  const apiBaseUrl = environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'

  return {
    apiBaseUrl,
    tokenUrl: `${apiBaseUrl}/v1/oauth2/token`,
  }
}

export function resolvePayPalConfig(config: PayPalRuntimeConfig = useRuntimeConfig()): PayPalResolvedConfig {
  const environment = normalizePayPalEnvironment(config.paypalEnvironment)
  const clientId = String(config.paypalClientId || '')
  const clientSecret = String(config.paypalClientSecret || '')

  return {
    clientId,
    clientSecret,
    environment,
    configured: Boolean(clientId && clientSecret),
    endpoints: getPayPalEndpoints(environment),
  }
}

export async function exchangePayPalClientCredentials(input: {
  clientId: string
  clientSecret: string
  environment: PayPalEnvironment
  endpoints: PayPalEndpoints
  now?: Date
  fetcher?: typeof fetch
}): Promise<PayPalTokenResult> {
  const now = input.now ?? new Date()
  const fetcher = input.fetcher ?? fetch
  const credentials = btoa(`${input.clientId}:${input.clientSecret}`)

  const response = await fetcher(input.endpoints.tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    throw new Error(`PayPal token request failed with ${response.status}`)
  }

  const body = await response.json() as {
    scope?: string
    access_token?: string
    token_type?: string
    app_id?: string
    expires_in?: number
  }

  if (!body.access_token) {
    throw new Error('PayPal token response did not include an access token')
  }

  const expiresInSeconds = Number(body.expires_in || 0)
  const tokenExpiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString()

  return {
    accessToken: body.access_token,
    tokenType: body.token_type || 'Bearer',
    appId: body.app_id || null,
    scopes: body.scope ? body.scope.split(/\s+/).filter(Boolean) : [],
    tokenExpiresAt,
  }
}
