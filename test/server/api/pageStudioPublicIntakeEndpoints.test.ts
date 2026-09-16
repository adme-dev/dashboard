import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createError, createEvent, getHeader, setResponseStatus, type H3Event } from 'h3'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ lead: vi.fn(), analytics: vi.fn(), auth: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/publicBoundary', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/pageStudio/publicBoundary')>(),
  acceptPageStudioPublicLead: (...args: unknown[]) => mocks.lead(...args),
  acceptPageStudioPublicAnalyticsEvent: (...args: unknown[]) => mocks.analytics(...args)
}))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({
  requirePageStudioMachineAuth: (...args: unknown[]) => mocks.auth(...args)
}))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getHeader', getHeader)
vi.stubGlobal('setResponseStatus', setResponseStatus)
vi.stubGlobal('readBody', async (event: H3Event) => event.context.testBody)

const { default: lead } = await import('~~/server/routes/internal/page-studio/leads/index.post')
const { default: analytics } = await import('~~/server/routes/internal/page-studio/analytics/events/index.post')
const common = {
  scope: { tenantId: 'tenant_one', clientId: 'client_one', siteId: 'site_one' },
  occurredAt: '2026-09-16T07:00:00.000Z', pageId: 'page_contact', pageRoute: '/contact',
  releaseId: 'release_one', versionDigest: 'a'.repeat(64)
}
const leadBody = { ...common, attribution: {}, fields: { email: 'test@example.invalid' }, formId: 'form_contact' }
const analyticsBody = { ...common, eventId: 'page_visit', kind: 'page_view' }

function event(body: unknown) {
  const request = new IncomingMessage(new Socket())
  request.headers['idempotency-key'] = 'intake_endpoint_acceptance'
  const result = createEvent(request, new ServerResponse(request))
  result.context.testBody = body
  return result
}

describe('public intake internal HTTP responses', () => {
  beforeEach(() => vi.resetAllMocks())
  afterAll(() => vi.unstubAllGlobals())

  it('preserves a changed-payload conflict through the real HTTP error projection', async () => {
    const error = { code: 'PUBLIC_LEAD_REQUEST_CONFLICT', message: 'This submission request cannot be reused for these details' }
    mocks.lead.mockRejectedValue(createError({ statusCode: 409, data: { error } }))
    const request = event(leadBody)
    await expect(lead(request)).resolves.toEqual({ error })
    expect(request.node.res.statusCode).toBe(409)
    expect(mocks.auth).toHaveBeenCalledWith(request)
    expect(mocks.lead).toHaveBeenCalledWith(request, { ...leadBody, idempotencyKey: 'intake_endpoint_acceptance' })
  })

  it.each([
    ['lead', lead, mocks.lead], ['analytics', analytics, mocks.analytics]
  ] as const)('returns stable 400 JSON for an invalid %s request without accepting it', async (_name, handler, accept) => {
    const request = event({})
    await expect(handler(request)).resolves.toMatchObject({ error: { code: 'INVALID_INPUT' } })
    expect(request.node.res.statusCode).toBe(400)
    expect(accept).not.toHaveBeenCalled()
  })

  it.each([
    ['lead', lead, leadBody, mocks.lead], ['analytics', analytics, analyticsBody, mocks.analytics]
  ] as const)('retains machine-auth denial for %s without accepting it', async (_name, handler, body, accept) => {
    mocks.auth.mockImplementation(() => {
      throw createError({ statusCode: 403, statusMessage: 'private detail' })
    })
    const request = event(body)
    await expect(handler(request)).resolves.toEqual({ error: { code: 'REQUEST_FAILED', message: 'Page Studio request failed' } })
    expect(request.node.res.statusCode).toBe(403)
    expect(accept).not.toHaveBeenCalled()
  })

  it('retains an analytics authority conflict instead of throwing during error handling', async () => {
    const error = { code: 'RELEASE_CHANGED', message: 'The active release has changed' }
    mocks.analytics.mockRejectedValue(createError({ statusCode: 409, data: { error } }))
    const request = event(analyticsBody)
    await expect(analytics(request)).resolves.toEqual({ error })
    expect(request.node.res.statusCode).toBe(409)
  })

  it.each([false, true])('keeps successful receipt status and identity (duplicate=%s)', async (duplicate) => {
    const receipt = { duplicate, leadId: 'lead_one' }
    mocks.lead.mockResolvedValue(receipt)
    const request = event(leadBody)
    await expect(lead(request)).resolves.toEqual(receipt)
    expect(request.node.res.statusCode).toBe(duplicate ? 200 : 201)
  })
})
