import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'

import { getTrustedTask5DelegatedExecution } from '~~/server/utils/godMode/internalExecutionDelegation'

const EXCLUDED_PREFIXES = [
  '/api/portal/',
  '/api/client-portal/',
  '/api/public/',
  '/api/webhooks',
  '/api/leads/webhook/',
  '/api/leads/_internal/',
  '/api/cron/',
  '/api/export/',
  '/api/internal/mcp/',
  '/api/mcp/',
  '/api/_nuxt_icon',
  '/_nuxt',
  '/__nuxt_devtools__'
]

const EXCLUDED_EXACT = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/magic-link',
  '/api/auth/dev-login',
  '/api/auth/xeroflow',
  '/api/admin/create-super-admin',
  '/api/admin/magic-link-debug',
  '/api/test/cookies',
  '/api/xero/callback',
  '/api/health'
])

function isExcluded(path: string): boolean {
  return !path.startsWith('/api/')
    || EXCLUDED_EXACT.has(path)
    || EXCLUDED_PREFIXES.some((prefix) => {
      const segment = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
      return path === segment || path.startsWith(`${segment}/`)
    })
}

export async function handleGodModeRequest(
  event: H3Event
): Promise<void> {
  const path = getRequestURL(event).pathname
  if (isExcluded(path)) return

  // Ordinary owner traffic remains ordinary. God mode is activated lazily by the centralized
  // bypass helpers only when application code is actually about to bypass a denied control.
  // Task 5 delegated MCP requests are already branded and durably coordinated by the auth chain;
  // validating an existing marker here preserves the exact-request boundary without duplicating it.
  await getTrustedTask5DelegatedExecution(event)
}

export default defineEventHandler(handleGodModeRequest)
