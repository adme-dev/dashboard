import { queryOne } from '~~/server/utils/db'
import { createMondayClient } from '~~/server/utils/mondayClient'
import { MONDAY_AUTOMATION_WRITE_SCOPES } from '~~/server/utils/mondayOAuth'

export type MondayConnection = {
  accessToken: string
  accountId: string | null
  accountName: string | null
  source: 'database' | 'environment'
  authMethod: 'oauth' | 'token'
  grantedScopes: string[]
}

export async function resolveMondayConnection(): Promise<MondayConnection | null> {
  const stored = await queryOne<{ access_token: string; account_id: string | null; account_name: string | null; settings: Record<string, unknown> | string | null }>(
    `SELECT access_token, account_id, account_name, settings FROM integration_configs WHERE integration_type = 'monday' LIMIT 1`,
  )
  if (stored?.access_token) {
    let settings: Record<string, unknown> = {}
    try { settings = typeof stored.settings === 'string' ? JSON.parse(stored.settings || '{}') : stored.settings || {} } catch { settings = {} }
    return {
      accessToken: stored.access_token,
      accountId: stored.account_id,
      accountName: stored.account_name,
      source: 'database',
      authMethod: settings.authMethod === 'oauth' ? 'oauth' : 'token',
      grantedScopes: Array.isArray(settings.scopes) ? settings.scopes.filter((scope): scope is string => typeof scope === 'string') : [],
    }
  }
  const token = process.env.MONDAY_API_TOKEN
  if (!token) return null
  try {
    const account = await (await createMondayClient(token)).testConnection()
    return { accessToken: token, accountId: account.id, accountName: account.name, source: 'environment', authMethod: 'token', grantedScopes: [] }
  } catch { return null }
}

/**
 * Resolve a credential that can perform the narrowly scoped Campaign Exceptions
 * mutations. Prefer the least-privilege OAuth grant once re-consented; until
 * then use the existing encrypted service token rather than broadening the
 * read/webhook OAuth token implicitly.
 */
export async function resolveMondayWriteConnection(): Promise<MondayConnection | null> {
  const preferred = await resolveMondayConnection()
  const preferredCanWrite = preferred?.authMethod === 'token'
    || MONDAY_AUTOMATION_WRITE_SCOPES.every(scope => preferred?.grantedScopes.includes(scope))
  if (preferred && preferredCanWrite) return preferred

  const serviceToken = process.env.MONDAY_API_TOKEN
  if (!serviceToken) return preferred
  try {
    const account = await (await createMondayClient(serviceToken)).testConnection()
    return {
      accessToken: serviceToken,
      accountId: account.id,
      accountName: account.name,
      source: 'environment',
      authMethod: 'token',
      grantedScopes: [],
    }
  } catch {
    return preferred
  }
}
