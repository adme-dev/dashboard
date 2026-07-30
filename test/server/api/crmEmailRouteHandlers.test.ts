import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSIONS } from '~~/server/utils/permissions'

const {
  requireRole,
  listCrmLeadInboxRoutes,
  createCrmLeadInboxRoute,
  rotateCrmLeadInboxRoute,
  revokeCrmLeadInboxRoute,
  parseCrmEmailRouteIssuanceConfig,
  requireClientCrmAccess,
  setResponseHeader
} = vi.hoisted(() => ({
  requireRole: vi.fn(),
  listCrmLeadInboxRoutes: vi.fn(),
  createCrmLeadInboxRoute: vi.fn(),
  rotateCrmLeadInboxRoute: vi.fn(),
  revokeCrmLeadInboxRoute: vi.fn(),
  parseCrmEmailRouteIssuanceConfig: vi.fn(),
  requireClientCrmAccess: vi.fn(),
  setResponseHeader: vi.fn()
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => requireRole(...args)
}))
vi.mock('~~/server/utils/crm/emailRouteManagement', () => ({
  listCrmLeadInboxRoutes: (...args: unknown[]) => listCrmLeadInboxRoutes(...args),
  createCrmLeadInboxRoute: (...args: unknown[]) => createCrmLeadInboxRoute(...args),
  rotateCrmLeadInboxRoute: (...args: unknown[]) => rotateCrmLeadInboxRoute(...args),
  revokeCrmLeadInboxRoute: (...args: unknown[]) => revokeCrmLeadInboxRoute(...args)
}))
vi.mock('~~/server/utils/crm/emailInboundConfig', () => ({
  parseCrmEmailRouteIssuanceConfig: (...args: unknown[]) => parseCrmEmailRouteIssuanceConfig(...args)
}))
vi.mock('~~/server/utils/crm/clientCrmAccess', () => ({
  requireClientCrmAccess: (...args: unknown[]) => requireClientCrmAccess(...args)
}))

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: { query?: unknown }) => unknown
  getRouterParam: (event: { params?: Record<string, string> }, key: string) => string | undefined
  readBody: (event: { body?: unknown }) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number }
  setResponseHeader: typeof setResponseHeader
}
globals.defineEventHandler = handler => handler
globals.getQuery = event => event.query ?? {}
globals.getRouterParam = (event, key) => event.params?.[key]
globals.readBody = async event => event.body
globals.createError = input => Object.assign(new Error(input.statusMessage), input)
globals.setResponseHeader = setResponseHeader

const clientId = '11111111-1111-4111-8111-111111111111'
const routeId = '22222222-2222-4222-8222-222222222222'
const actorId = '33333333-3333-4333-8333-333333333333'
const issuance = {
  currentVersion: 7,
  domain: 'inbound.xeroflow.test',
  secret: 'a'.repeat(32)
}
const safeRoute = {
  id: routeId,
  label: 'CRM inbox',
  kind: 'lead_inbox',
  clientId,
  recipientDomain: 'inbound.xeroflow.test',
  status: 'never_used',
  createdAt: '2026-07-31T00:00:00.000Z',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  canRotate: true,
  canRevoke: true,
  addressAvailable: false
}
const portalSafeRoute = {
  id: routeId,
  label: 'CRM inbox',
  kind: 'lead_inbox',
  recipientDomain: 'inbound.xeroflow.test',
  status: 'never_used',
  createdAt: '2026-07-31T00:00:00.000Z',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  canRotate: true,
  canRevoke: true,
  addressAvailable: false
}

const agencyHandlers = [
  { name: 'list', path: '~~/server/api/crm/email-routes/index.get', event: { query: { client_id: clientId } } },
  { name: 'create', path: '~~/server/api/crm/email-routes/index.post', event: { body: { client_id: clientId, label: 'CRM inbox' } } },
  { name: 'rotate', path: '~~/server/api/crm/email-routes/[id]/rotate.post', event: { params: { id: routeId }, body: { client_id: clientId } } },
  { name: 'revoke', path: '~~/server/api/crm/email-routes/[id].delete', event: { params: { id: routeId }, body: { client_id: clientId } } }
] as const

describe('agency CRM email route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ id: actorId })
    parseCrmEmailRouteIssuanceConfig.mockReturnValue(issuance)
    listCrmLeadInboxRoutes.mockResolvedValue([safeRoute])
    createCrmLeadInboxRoute.mockResolvedValue({ route: safeRoute, issuedAddress: 'lead+one-time@inbound.xeroflow.test', addressShownOnce: true })
    rotateCrmLeadInboxRoute.mockResolvedValue({ route: safeRoute, issuedAddress: 'lead+rotated@inbound.xeroflow.test', addressShownOnce: true })
    revokeCrmLeadInboxRoute.mockResolvedValue({ route: safeRoute })
  })

  it.each(agencyHandlers)('rejects portal sessions before staff RBAC for $name', async ({ path, event }) => {
    const handler = (await import(path)).default as (event: unknown) => Promise<unknown>

    await expect(handler({ ...event, context: { clientPortalUser: { id: 'portal-user' } } })).rejects.toMatchObject({ statusCode: 403 })
    expect(requireRole).not.toHaveBeenCalled()
  })

  it.each(agencyHandlers)('requires the client staff permission for $name', async ({ path, event }) => {
    const handler = (await import(path)).default as (event: unknown) => Promise<unknown>

    await handler({ ...event, context: {} })

    expect(requireRole).toHaveBeenCalledWith(expect.anything(), PERMISSIONS.CLIENTS)
  })

  it.each([
    { client_id: 'not-a-uuid' },
    { client_id: clientId, unexpected: 'value' }
  ])('rejects malformed list filters', async (query) => {
    const handler = (await import('~~/server/api/crm/email-routes/index.get')).default

    await expect(handler({ context: {}, query } as never)).rejects.toBeTruthy()
    expect(listCrmLeadInboxRoutes).not.toHaveBeenCalled()
  })

  it('uses only server-owned issuance bindings for create and keeps the response private', async () => {
    const handler = (await import('~~/server/api/crm/email-routes/index.post')).default
    const event = {
      context: {
        cloudflare: {
          env: {
            CRM_EMAIL_REPLY_SECRETS: '{"7":"server secret"}',
            CRM_EMAIL_REPLY_CURRENT_VERSION: '7',
            CRM_EMAIL_LEAD_ROUTE_DOMAIN: 'inbound.xeroflow.test'
          }
        }
      },
      body: { client_id: clientId, label: '  CRM inbox  ' }
    }

    const result = await handler(event as never)

    expect(parseCrmEmailRouteIssuanceConfig).toHaveBeenCalledWith({
      secrets: '{"7":"server secret"}',
      currentVersion: '7',
      domain: 'inbound.xeroflow.test'
    })
    expect(createCrmLeadInboxRoute).toHaveBeenCalledWith({
      clientId,
      label: 'CRM inbox',
      actor: { id: actorId, type: 'team_member' },
      issuance
    })
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
    expect(JSON.stringify(result)).not.toContain('routeTokenHash')
    expect(JSON.stringify(result)).not.toContain('tokenVersion')
  })

  it('uses server-owned issuance configuration and private caching for rotation', async () => {
    const handler = (await import('~~/server/api/crm/email-routes/[id]/rotate.post')).default
    const event = {
      context: { cloudflare: { env: {} } },
      params: { id: routeId },
      body: { client_id: clientId }
    }
    const priorSecrets = process.env.CRM_EMAIL_REPLY_SECRETS
    const priorVersion = process.env.CRM_EMAIL_REPLY_CURRENT_VERSION
    const priorDomain = process.env.CRM_EMAIL_LEAD_ROUTE_DOMAIN
    process.env.CRM_EMAIL_REPLY_SECRETS = '{"7":"local secret"}'
    process.env.CRM_EMAIL_REPLY_CURRENT_VERSION = '7'
    process.env.CRM_EMAIL_LEAD_ROUTE_DOMAIN = 'inbound.xeroflow.test'

    try {
      await handler(event as never)
    } finally {
      if (priorSecrets === undefined) delete process.env.CRM_EMAIL_REPLY_SECRETS
      else process.env.CRM_EMAIL_REPLY_SECRETS = priorSecrets
      if (priorVersion === undefined) delete process.env.CRM_EMAIL_REPLY_CURRENT_VERSION
      else process.env.CRM_EMAIL_REPLY_CURRENT_VERSION = priorVersion
      if (priorDomain === undefined) delete process.env.CRM_EMAIL_LEAD_ROUTE_DOMAIN
      else process.env.CRM_EMAIL_LEAD_ROUTE_DOMAIN = priorDomain
    }

    expect(rotateCrmLeadInboxRoute).toHaveBeenCalledWith({
      clientId,
      routeId,
      actor: { id: actorId, type: 'team_member' },
      issuance
    })
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
  })

  it.each([
    ['invalid client id', { client_id: 'not-a-uuid', label: 'CRM inbox' }],
    ['blank label', { client_id: clientId, label: '   ' }],
    ['unexpected domain', { client_id: clientId, label: 'CRM inbox', domain: 'attacker.example' }],
    ['unexpected version', { client_id: clientId, label: 'CRM inbox', version: 999 }],
    ['unexpected route kind', { client_id: clientId, label: 'CRM inbox', kind: 'conversation_reply' }],
    ['unexpected actor', { client_id: clientId, label: 'CRM inbox', actor: actorId }]
  ])('rejects unsafe create body: %s', async (_name, body) => {
    const handler = (await import('~~/server/api/crm/email-routes/index.post')).default

    await expect(handler({ context: {}, body } as never)).rejects.toBeTruthy()
    expect(createCrmLeadInboxRoute).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid route id', { params: { id: 'not-a-uuid' }, body: { client_id: clientId } }],
    ['unsafe rotate body', { params: { id: routeId }, body: { client_id: clientId, domain: 'attacker.example' } }],
    ['unsafe revoke body', { params: { id: routeId }, body: { client_id: clientId, actor: actorId } }]
  ])('rejects malformed route mutations: %s', async (name, event) => {
    const path = name === 'unsafe revoke body'
      ? '~~/server/api/crm/email-routes/[id].delete'
      : '~~/server/api/crm/email-routes/[id]/rotate.post'
    const handler = (await import(path)).default as (event: unknown) => Promise<unknown>

    await expect(handler({ context: {}, ...event })).rejects.toBeTruthy()
    expect(rotateCrmLeadInboxRoute).not.toHaveBeenCalled()
    expect(revokeCrmLeadInboxRoute).not.toHaveBeenCalled()
  })
})

describe('portal CRM email route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireClientCrmAccess.mockResolvedValue({ id: actorId, clientId })
    parseCrmEmailRouteIssuanceConfig.mockReturnValue(issuance)
    listCrmLeadInboxRoutes.mockResolvedValue([portalSafeRoute])
    createCrmLeadInboxRoute.mockResolvedValue({ route: safeRoute, issuedAddress: 'lead+one-time@inbound.xeroflow.test', addressShownOnce: true })
    rotateCrmLeadInboxRoute.mockResolvedValue({ route: safeRoute, issuedAddress: 'lead+rotated@inbound.xeroflow.test', addressShownOnce: true })
    revokeCrmLeadInboxRoute.mockResolvedValue({ route: safeRoute })
  })

  it('requires CRM view and derives list tenancy from the portal session', async () => {
    const handler = (await import('~~/server/api/client-portal/crm/email-routes/index.get')).default
    const event = { context: {} }

    const result = await handler(event as never)

    expect(requireClientCrmAccess).toHaveBeenCalledWith(event, 'view')
    expect(listCrmLeadInboxRoutes).toHaveBeenCalledWith({ clientId, includeClientId: false })
    expect(result).toEqual({ items: [portalSafeRoute] })
  })

  it('requires CRM admin and server-owned issuance for a portal create', async () => {
    const handler = (await import('~~/server/api/client-portal/crm/email-routes/index.post')).default
    const event = {
      context: {
        cloudflare: {
          env: {
            CRM_EMAIL_REPLY_SECRETS: '{"7":"server secret"}',
            CRM_EMAIL_REPLY_CURRENT_VERSION: '7',
            CRM_EMAIL_LEAD_ROUTE_DOMAIN: 'inbound.xeroflow.test'
          }
        }
      },
      body: { label: '  Portal inbox  ' }
    }

    await handler(event as never)

    expect(requireClientCrmAccess).toHaveBeenCalledWith(event, 'admin')
    expect(createCrmLeadInboxRoute).toHaveBeenCalledWith({
      clientId,
      label: 'Portal inbox',
      actor: { id: actorId, type: 'client_user' },
      issuance
    })
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
  })

  it.each([
    ['rotate', '~~/server/api/client-portal/crm/email-routes/[id]/rotate.post', rotateCrmLeadInboxRoute],
    ['revoke', '~~/server/api/client-portal/crm/email-routes/[id].delete', revokeCrmLeadInboxRoute]
  ])('requires CRM admin and session tenancy for portal $name', async (_name, path, service) => {
    const handler = (await import(path)).default as (event: unknown) => Promise<unknown>
    const event = { context: {}, params: { id: routeId }, body: {} }

    await handler(event as never)

    expect(requireClientCrmAccess).toHaveBeenCalledWith(event, 'admin')
    expect(service).toHaveBeenCalledWith(expect.objectContaining({
      clientId,
      routeId,
      actor: { id: actorId, type: 'client_user' }
    }))
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
  })

  it.each([
    ['rotate', '~~/server/api/client-portal/crm/email-routes/[id]/rotate.post', rotateCrmLeadInboxRoute],
    ['revoke', '~~/server/api/client-portal/crm/email-routes/[id].delete', revokeCrmLeadInboxRoute]
  ])('accepts a bodyless portal $name mutation', async (_name, path, service) => {
    const handler = (await import(path)).default as (event: unknown) => Promise<unknown>
    const event = { context: {}, params: { id: routeId } }

    await handler(event as never)

    expect(service).toHaveBeenCalledWith(expect.objectContaining({ clientId, routeId }))
  })

  it.each([
    ['create client override', '~~/server/api/client-portal/crm/email-routes/index.post', { client_id: clientId, label: 'Portal inbox' }],
    ['create actor override', '~~/server/api/client-portal/crm/email-routes/index.post', { actor: actorId, label: 'Portal inbox' }],
    ['rotate client override', '~~/server/api/client-portal/crm/email-routes/[id]/rotate.post', { client_id: clientId }],
    ['revoke actor override', '~~/server/api/client-portal/crm/email-routes/[id].delete', { actor: actorId }]
  ])('rejects portal body that could override tenancy or actor: %s', async (_name, path, body) => {
    const handler = (await import(path)).default as (event: unknown) => Promise<unknown>

    await expect(handler({ context: {}, params: { id: routeId }, body } as never)).rejects.toBeTruthy()
    expect(createCrmLeadInboxRoute).not.toHaveBeenCalled()
    expect(rotateCrmLeadInboxRoute).not.toHaveBeenCalled()
    expect(revokeCrmLeadInboxRoute).not.toHaveBeenCalled()
  })
})
