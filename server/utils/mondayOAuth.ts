import type { H3Event } from 'h3'

export const MONDAY_OAUTH_CALLBACK_PATH = '/api/agency/monday/oauth/callback'
export const MONDAY_OAUTH_STATE_COOKIE = 'monday_oauth_state'
export const MONDAY_OAUTH_SCOPES = [
  'me:read',
  'boards:read',
  'workspaces:read',
  'users:read',
  'updates:read',
  'updates:write',
  'assets:read',
  'boards:write',
  'webhooks:read',
  'webhooks:write',
] as const

export function getMondayOAuthValue(event: H3Event, key: string): string {
  const binding = (event.context as any).cloudflare?.env?.[key]
  return String(binding || process.env[key] || '').trim()
}
