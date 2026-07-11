import { queryOne } from '~~/server/utils/db'
import { createMondayClient } from '~~/server/utils/mondayClient'

export type MondayConnection = { accessToken: string; accountId: string | null; accountName: string | null; source: 'database' | 'environment'; authMethod: 'oauth' | 'token' }

export async function resolveMondayConnection(): Promise<MondayConnection | null> {
  const stored = await queryOne<{ access_token: string; account_id: string | null; account_name: string | null; settings: Record<string, unknown> | string | null }>(
    `SELECT access_token, account_id, account_name, settings FROM integration_configs WHERE integration_type = 'monday' LIMIT 1`,
  )
  if (stored?.access_token) {
    let settings: Record<string, unknown> = {}
    try { settings = typeof stored.settings === 'string' ? JSON.parse(stored.settings || '{}') : stored.settings || {} } catch { settings = {} }
    return { accessToken: stored.access_token, accountId: stored.account_id, accountName: stored.account_name, source: 'database', authMethod: settings.authMethod === 'oauth' ? 'oauth' : 'token' }
  }
  const token = process.env.MONDAY_API_TOKEN
  if (!token) return null
  try {
    const account = await (await createMondayClient(token)).testConnection()
    return { accessToken: token, accountId: account.id, accountName: account.name, source: 'environment', authMethod: 'token' }
  } catch { return null }
}
