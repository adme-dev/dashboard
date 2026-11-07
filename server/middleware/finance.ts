import { defineEventHandler, getRequestURL, setResponseHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { assertFinancePermission } from '~~/server/utils/financeAccess'
import { isFinanceReadMachineRequest } from '~~/server/utils/financeMachineAccess'
import { normalizeFinancePath, requiresFinancePermission } from '~~/server/utils/financeRoutePolicy'

const reads = new Set(['GET', 'HEAD', 'OPTIONS'])
/** Runs after auth; accounting admission precedes handler/cache/provider reads, including in development. */
export default defineEventHandler(async (event) => {
  const path = normalizeFinancePath(getRequestURL(event).pathname)
  if (!requiresFinancePermission(path)) return
  setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  const method = event.method.toUpperCase()
  // The OAuth callback resolves its identity from Xero and checks the fresh grant before binding.
  if (path === '/api/xero/callback' && method === 'GET') return
  if (isFinanceReadMachineRequest(event)) return
  const user = await requireAuth(event)
  await assertFinancePermission(event, user.id, !reads.has(method) || path === '/api/xero/login')
})
