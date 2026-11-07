import { beforeEach, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const mocks = vi.hoisted(() => ({ serviceAuth: vi.fn(), asserted: vi.fn(), serviceAuthority: vi.fn(), finance: vi.fn(), run: vi.fn() }))
vi.mock('~~/server/utils/ai/platformAgentServiceAuth', () => ({ requirePlatformAgentServiceAuth: mocks.serviceAuth }))
vi.mock('~~/server/utils/ai/platformAgentBridgeAssertion', () => ({ optionalPlatformAgentAssertionAuthority: mocks.asserted }))
vi.mock('~~/server/utils/ai/platformAgentAuthority', () => ({ resolveServicePlatformAgentAuthority: mocks.serviceAuthority }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: mocks.finance }))
vi.mock('~~/server/utils/ai/financialWatchAgentRuntime', () => ({ runFinancialWatchAgentRequest: mocks.run }))
const authority = (type: 'user' | 'service') => ({ actor: { type, id: type === 'user' ? 'staff' : 'service' }, tenantId: 'tenant', allowedClientIds: ['client'], permissions: [type === 'user' ? 'FINANCE' : 'PLATFORM_AGENTS_SERVICE'], correlationId: 'correlation', source: type === 'user' ? 'signed_service_assertion' : 'authenticated_service' })
const body = { prompt: 'Review finance.', context: { tenantId: 'tenant', clientId: 'client' } }
const request = { body } as unknown as H3Event
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('FINANCIAL_WATCH_AGENT_ENABLED', 'true')
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readBody', async () => body)
  mocks.serviceAuth.mockResolvedValue(undefined)
  mocks.asserted.mockResolvedValue(authority('user'))
  mocks.serviceAuthority.mockResolvedValue(authority('service'))
  mocks.finance.mockResolvedValue(undefined)
  mocks.run.mockResolvedValue({ mode: 'read_only' })
})
it('rejects a signed user whose Finance grant has since been revoked before runtime access', async () => {
  const handler = (await import('~~/server/api/internal/platform-agents/financial-watch/ask.post')).default
  mocks.finance.mockRejectedValueOnce({ statusCode: 403 })
  await expect(handler(request)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.finance).toHaveBeenCalledWith(request, 'staff')
  expect(mocks.run).not.toHaveBeenCalled()
  expect(mocks.serviceAuthority).not.toHaveBeenCalled()
})
it('runs for a currently granted signed user after fresh Finance verification', async () => {
  const handler = (await import('~~/server/api/internal/platform-agents/financial-watch/ask.post')).default
  await handler(request)
  expect(mocks.finance).toHaveBeenCalledWith(request, 'staff')
  expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ userId: 'staff' }))
})
it('preserves the independently authenticated service-only bridge without inventing a user grant', async () => {
  const handler = (await import('~~/server/api/internal/platform-agents/financial-watch/ask.post')).default
  mocks.asserted.mockResolvedValueOnce(null)
  await handler(request)
  expect(mocks.serviceAuth).toHaveBeenCalledWith(request)
  expect(mocks.finance).not.toHaveBeenCalled()
  expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ userId: null }))
})
it('rejects failed service authentication before assertion or runtime access', async () => {
  const handler = (await import('~~/server/api/internal/platform-agents/financial-watch/ask.post')).default
  mocks.serviceAuth.mockRejectedValueOnce({ statusCode: 401 })
  await expect(handler(request)).rejects.toMatchObject({ statusCode: 401 })
  expect(mocks.asserted).not.toHaveBeenCalled()
  expect(mocks.finance).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
})
