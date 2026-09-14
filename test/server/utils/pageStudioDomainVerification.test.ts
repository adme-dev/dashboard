import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { refreshPageStudioDomain } from '~~/server/utils/pageStudio/siteOperations'

const db = vi.hoisted(() => ({ queryOne: vi.fn(), queryRows: vi.fn(), execute: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)

const hostname = 'www.customer.example'
const providerId = 'a'.repeat(32)
const target = 'sites.platform.example'
const input = {
  actorId: 'staff', tenantId: 'tenant', siteId: 'site', domainId: 'domain',
  event: { context: { cloudflare: { env: {
    PAGE_STUDIO_CLOUDFLARE_API_TOKEN: 'test-token-only',
    PAGE_STUDIO_CLOUDFLARE_ZONE_ID: 'b'.repeat(32),
    PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET: target
  } } } } as unknown as H3Event
}
const fetcher = vi.fn()
function provider(override = {}) {
  return { success: true, result: { id: providerId, hostname, status: 'active', ssl: { status: 'active' }, ...override } }
}
function dns(answers: unknown[], status = 0) {
  return { Status: status, Answer: answers }
}
const cname = (name = hostname, data = target) => ({ type: 5, name, data })
function responses(providerBody: unknown, dnsBody: unknown) {
  fetcher.mockResolvedValueOnce(Response.json(providerBody)).mockResolvedValueOnce(Response.json(dnsBody))
}

describe('Page Studio domain activation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', fetcher)
    db.queryOne.mockResolvedValueOnce({ client_id: 'client', custom_domain_limit: 2, entitlement_id: 'entitlement', tenant_id: 'tenant' })
      .mockResolvedValueOnce({ cloudflare_hostname_id: providerId, normalized_hostname: hostname })
    db.execute.mockResolvedValue(1)
  })

  it('keeps a prevalidated hostname inactive while DNS still points to the old website', async () => {
    responses(provider(), dns([cname(hostname, 'old-host.example')]))
    const result = await refreshPageStudioDomain(input)
    expect(result.lifecycleState).toBe('validating')
    expect(result.dnsStatus).toBe('pending')
  })

  it('activates only with matching DNS, hostname ownership and TLS', async () => {
    responses(provider(), dns([cname(hostname.toUpperCase() + '.', target.toUpperCase() + '.')]))
    const result = await refreshPageStudioDomain(input)
    expect(result.lifecycleState).toBe('active')
    expect(result.ownershipValidation).toMatchObject({ cnameTarget: target, dnsVerified: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.every(([, init]) => init.redirect === 'manual' && init.signal instanceof AbortSignal)).toBe(true)
  })

  it.each([
    dns([cname('unrelated.example')]),
    dns([{ ...cname(), type: 16 }]),
    dns([cname()], 2),
    { Answer: [cname()] }
  ])('does not accept unrelated, wrong-type or unsuccessful DNS answers', async (answer) => {
    responses(provider(), answer)
    expect((await refreshPageStudioDomain(input)).lifecycleState).not.toBe('active')
  })

  it('follows only a connected CNAME chain', async () => {
    responses(provider(), dns([cname(hostname, 'alias.example'), cname('alias.example', target)]))
    expect((await refreshPageStudioDomain(input)).lifecycleState).toBe('active')
  })

  it('requires TLS even after ownership and DNS verification', async () => {
    responses(provider({ ssl: { status: 'pending_validation' } }), dns([cname()]))
    expect((await refreshPageStudioDomain(input)).lifecycleState).not.toBe('active')
  })

  it.each([{ id: 'c'.repeat(32) }, { hostname: 'other-customer.example' }])('rejects a provider identity mismatch without writing state', async (override) => {
    responses(provider(override), dns([cname()]))
    await expect(refreshPageStudioDomain(input)).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_MISMATCH' })
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('does not reactivate a domain detached while provider verification was running', async () => {
    responses(provider(), dns([cname()]))
    db.execute.mockResolvedValueOnce(0)
    await expect(refreshPageStudioDomain(input)).rejects.toMatchObject({ code: 'DOMAIN_CHANGED' })
    expect(db.execute).toHaveBeenCalledTimes(1)
    expect(db.execute.mock.calls[0][0]).toContain('lifecycle_state <> \'detached\'')
  })
})
