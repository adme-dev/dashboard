import { createError } from 'h3'
import { XeroClient } from 'xero-node'
import type { TokenSet } from 'xero-node'

const DEFAULT_SCOPES = [
  'offline_access',
  'accounting.reports.read',
  'accounting.settings.read',
  'accounting.transactions.read',
  'accounting.contacts.read'
]

export type XeroTokenSet = TokenSet & {
  expires_at: number
}

type CreateClientOptions = {
  tokenSet?: XeroTokenSet
  state?: string
}

export async function createXeroClient(options: CreateClientOptions = {}) {
  const config = useRuntimeConfig()
  const clientId = config.xeroClientId
  const clientSecret = config.xeroClientSecret
  const redirectUri = config.xeroRedirectUri
  const httpTimeout = Number(config.xeroHttpTimeout ?? 15000)

  if (!clientId || !clientSecret || !redirectUri) {
    throw createError({ statusCode: 500, statusMessage: 'Xero OAuth not configured' })
  }

  const client = new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [redirectUri],
    scopes: DEFAULT_SCOPES,
    state: options.state,
    httpTimeout
  })

  try {
    await client.initialize()
  } catch (err: any) {
    if (err?.message?.includes('timeout')) {
      throw createError({
        statusCode: 504,
        statusMessage: 'Xero authorization discovery timed out. Please try again or check network access.'
      })
    }
    throw err
  }

  if (options.tokenSet) {
    client.setTokenSet(toTokenSet(options.tokenSet))
  }

  if (options.state) {
    client.config.state = options.state
  }

  return client
}

export function toStoredTokenSet(token: TokenSet): XeroTokenSet {
  if (!token.expires_at) {
    throw createError({ statusCode: 500, statusMessage: 'Received token without expiry' })
  }
  return {
    ...token,
    expires_at: token.expires_at * 1000
  }
}

export function toTokenSet(stored: XeroTokenSet): TokenSet {
  return {
    ...stored,
    expires_at: Math.floor(stored.expires_at / 1000)
  }
}
