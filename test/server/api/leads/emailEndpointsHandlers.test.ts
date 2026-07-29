import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireRole, listEmailEndpoints, listEmailEndpointsForActor, createEmailEndpoint, updateEmailEndpoint, rotateEmailEndpoint, getEmailEndpoint, listEmailEndpointIngestions, toSafeEmailEndpoint } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  listEmailEndpoints: vi.fn(),
  listEmailEndpointsForActor: vi.fn(),
  createEmailEndpoint: vi.fn(),
  updateEmailEndpoint: vi.fn(),
  rotateEmailEndpoint: vi.fn(),
  getEmailEndpoint: vi.fn(),
  listEmailEndpointIngestions: vi.fn(),
  toSafeEmailEndpoint: vi.fn((endpoint: Record<string, unknown>) => ({ id: endpoint.id, email_address: endpoint.email_address }))
}))

vi.mock('~~/server/utils/auth', () => ({ requireRole: (...args: unknown[]) => requireRole(...args) }))
vi.mock('~~/server/utils/leads/emailEndpoint', () => ({
  EMAIL_AI_PRIVACY_APPROVAL_VERSION: 1,
  listEmailEndpoints: (...args: unknown[]) => listEmailEndpoints(...args),
  listEmailEndpointsForActor: (...args: unknown[]) => listEmailEndpointsForActor(...args),
  createEmailEndpoint: (...args: unknown[]) => createEmailEndpoint(...args),
  updateEmailEndpoint: (...args: unknown[]) => updateEmailEndpoint(...args),
  rotateEmailEndpoint: (...args: unknown[]) => rotateEmailEndpoint(...args),
  getEmailEndpoint: (...args: unknown[]) => getEmailEndpoint(...args),
  listEmailEndpointIngestions: (...args: unknown[]) => listEmailEndpointIngestions(...args),
  toSafeEmailEndpoint: (...args: unknown[]) => toSafeEmailEndpoint(...args)
}))

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: { query?: unknown }) => unknown
  getRouterParam: (event: { params?: Record<string, string> }, key: string) => string | undefined
  readBody: (event: { body?: unknown }) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number }
}
globals.defineEventHandler = handler => handler
globals.getQuery = event => event.query ?? {}
globals.getRouterParam = (event, key) => event.params?.[key]
globals.readBody = async event => event.body
globals.createError = input => Object.assign(new Error(input.statusMessage), input)

const clientId = '11111111-1111-4111-8111-111111111111'
const endpointId = '33333333-3333-4333-8333-333333333333'
const actorId = '22222222-2222-4222-8222-222222222222'
const rawEndpoint = { id: endpointId, email_address: 'carsales-0123456789@leads.xeroflow.io', address_token: '0123456789', previous_address_token: 'abcdefghjk' }

const handlers = [
  { name: 'list', path: '~~/server/api/leads/email-endpoints/index.get', event: { query: { client_id: clientId } } },
  { name: 'create', path: '~~/server/api/leads/email-endpoints/index.post', event: { body: { client_id: clientId, label: 'Carsales', form_name: 'Carsales' } } },
  { name: 'detail', path: '~~/server/api/leads/email-endpoints/[id].get', event: { params: { id: endpointId } } },
  { name: 'update', path: '~~/server/api/leads/email-endpoints/[id].patch', event: { params: { id: endpointId }, body: { enabled: false } } },
  { name: 'rotate', path: '~~/server/api/leads/email-endpoints/[id]/rotate.post', event: { params: { id: endpointId } } },
  { name: 'history', path: '~~/server/api/leads/email-endpoints/[id]/ingestions.get', event: { params: { id: endpointId }, query: { limit: '2' } } }
] as const

describe('email endpoint handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ id: actorId })
    listEmailEndpoints.mockResolvedValue([])
    listEmailEndpointsForActor.mockResolvedValue({ items: [], clients: [] })
    createEmailEndpoint.mockResolvedValue(rawEndpoint)
    updateEmailEndpoint.mockResolvedValue(rawEndpoint)
    rotateEmailEndpoint.mockResolvedValue(rawEndpoint)
    getEmailEndpoint.mockResolvedValue({ id: endpointId, email_address: rawEndpoint.email_address })
    listEmailEndpointIngestions.mockResolvedValue({ items: [], nextCursor: null })
  })

  it.each(handlers)('rejects portal sessions for $name before staff RBAC or service access', async ({ path, event }) => {
    const handler = (await import(path)).default as (event: unknown) => Promise<unknown>
    await expect(handler({ ...event, context: { clientPortalUser: { id: 'portal' } } })).rejects.toMatchObject({ statusCode: 403 })
    expect(requireRole).not.toHaveBeenCalled()
  })

  it.each(handlers)('uses staff permission and never serializes raw tokens for $name', async ({ name, path, event }) => {
    const handler = (await import(path)).default as (event: unknown) => Promise<{ endpoint?: Record<string, unknown> }>
    const result = await handler({ ...event, context: {} })
    expect(requireRole).toHaveBeenCalledOnce()
    if (['create', 'update', 'rotate'].includes(name)) {
      expect(result.endpoint).toEqual({ id: endpointId, email_address: rawEndpoint.email_address })
      expect(result.endpoint).not.toHaveProperty('address_token')
      expect(result.endpoint).not.toHaveProperty('previous_address_token')
    }
  })

  it('passes only a server-resolved AI capability into an explicit versioned fallback approval', async () => {
    const handler = (await import('~~/server/api/leads/email-endpoints/index.post')).default
    await handler({
      context: { cloudflare: { env: { AI: { run: vi.fn() } } } },
      body: {
        client_id: clientId,
        label: 'General',
        form_name: 'General enquiries',
        ai_extraction_mode: 'fallback',
        ai_privacy_approval_version: 1
      }
    } as never)

    expect(createEmailEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        aiExtractionMode: 'fallback',
        aiPrivacyApprovalVersion: 1
      }),
      actorId,
      { aiExtractionAvailable: true }
    )
  })

  it('keeps fallback disablement available when the AI runtime capability is absent', async () => {
    const handler = (await import('~~/server/api/leads/email-endpoints/[id].patch')).default
    await handler({
      context: { cloudflare: { env: {} } },
      params: { id: endpointId },
      body: { ai_extraction_mode: 'disabled' }
    } as never)

    expect(updateEmailEndpoint).toHaveBeenCalledWith(
      endpointId,
      expect.objectContaining({ aiExtractionMode: 'disabled' }),
      actorId,
      { aiExtractionAvailable: false }
    )
  })
})
