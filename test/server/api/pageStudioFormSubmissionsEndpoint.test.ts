import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context: {
    cloudflare?: { env?: Record<string, unknown> }
    params: Record<string, string>
  }
}

Object.assign(globalThis, {
  defineEventHandler: <T>(handler: T) => handler,
  eventHandler: <T>(handler: T) => handler,
  getRouterParam: (event: TestEvent, key: string) => event.context.params[key],
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
})

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  cloudflare: vi.fn(),
  neon: vi.fn()
}))

vi.mock('~~/server/utils/pageStudio/access', () => ({
  requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.access(...args)
}))
vi.mock('~~/server/utils/pageStudio/businessContent', () => ({
  listPageStudioBusinessSubmissions: (...args: unknown[]) => mocks.cloudflare(...args)
}))
vi.mock('~~/server/utils/pageStudio/siteOperations', () => ({
  listPageStudioSubmissions: (...args: unknown[]) => mocks.neon(...args)
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioHttpError: (error: unknown) => { throw error }
}))

const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/forms/submissions.get')
const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
const scope = { tenantId: 'tenant_test', clientId: 'client_test', businessId: 'business_test', siteId, environment: 'preview' as const }

function event(source?: string): TestEvent {
  return {
    context: {
      params: { siteId },
      cloudflare: { env: source ? { PAGE_STUDIO_FORM_SUBMISSIONS_SOURCE: source } : {} }
    }
  }
}

describe('Page Studio form submissions endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ tenantId: 'tenant_test', user: { id: 'staff_test' } })
    mocks.cloudflare.mockResolvedValue([{
      fieldData: { email: 'guest@example.com' },
      formId: 'form_booking',
      id: 'submission_one',
      pageId: 'page_home',
      scope,
      submittedAt: '2026-09-08T10:00:00.000Z'
    }])
    mocks.neon.mockResolvedValue([{ id: 'lead_one' }])
  })

  it('uses the scoped Cloudflare source only when explicitly enabled', async () => {
    const result = await handler(event('business-content'))
    expect(mocks.cloudflare).toHaveBeenCalledWith(expect.objectContaining({
      actor: { role: 'agency', actorId: 'staff_test', tenantId: 'tenant_test' },
      siteId,
      env: { PAGE_STUDIO_FORM_SUBMISSIONS_SOURCE: 'business-content' }
    }))
    expect(mocks.neon).not.toHaveBeenCalled()
    expect(result.submissions[0]).toMatchObject({ formId: 'form_booking', fields: { email: 'guest@example.com' } })
  })

  it('retains the Neon compatibility source until the switch is configured', async () => {
    const result = await handler(event())
    expect(mocks.cloudflare).not.toHaveBeenCalled()
    expect(mocks.neon).toHaveBeenCalledWith('tenant_test', siteId)
    expect(result).toEqual({ submissions: [{ id: 'lead_one' }] })
  })
})
