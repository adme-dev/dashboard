import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshPageStudioDomain } from '../../../workers/page-studio-management/src/domainConfiguration'
import { PageStudioDomainAttachmentError } from '../../../workers/page-studio-management/src/domainAttachmentProvider'

const service = vi.hoisted(() => ({ prepare: vi.fn(), saveVerification: vi.fn() }))
vi.mock('../../../workers/page-studio-management/src/domainAttachment', () => ({ domainAttachmentService: () => service }))

const hostname = 'www.customer.example'
const providerId = 'a'.repeat(32)
const target = 'sites.platform.example'
const input = { kind: 'agency' as const,
  actorId: 'staff', tenantId: 'tenant', siteId: 'site', domainId: 'domain',
  env: {
    PAGE_STUDIO_CLOUDFLARE_API_TOKEN: 'test-token-only',
    PAGE_STUDIO_CLOUDFLARE_ZONE_ID: 'b'.repeat(32),
    PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET: target
  }
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
  service.prepare.mockResolvedValue({ current: { id: input.domainId, normalized_hostname: hostname, cloudflare_hostname_id: providerId }, provider: (providerBody as { result: unknown }).result })
  fetcher.mockResolvedValueOnce(Response.json(dnsBody))
}

describe('Page Studio domain activation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', fetcher)
    service.saveVerification.mockResolvedValue(undefined)
  })

  it('keeps a prevalidated hostname inactive while DNS still points to the old website', async () => {
    responses(provider(), dns([cname(hostname, 'old-host.example')]))
    const result = await refreshPageStudioDomain(input, vi.fn())
    expect(result.lifecycleState).toBe('validating')
    expect(result.dnsStatus).toBe('pending')
  })

  it('activates only with matching DNS, hostname ownership and TLS', async () => {
    responses(provider(), dns([cname(hostname.toUpperCase() + '.', target.toUpperCase() + '.')]))
    const result = await refreshPageStudioDomain(input, vi.fn())
    expect(result.lifecycleState).toBe('active')
    expect(result.ownershipValidation).toMatchObject({ cnameTarget: target, dnsVerified: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls.every(([, init]) => init.redirect === 'manual' && init.signal instanceof AbortSignal)).toBe(true)
  })

  it.each([
    dns([cname('unrelated.example')]),
    dns([{ ...cname(), type: 16 }]),
    dns([cname()], 2),
    { Answer: [cname()] }
  ])('does not accept unrelated, wrong-type or unsuccessful DNS answers', async (answer) => {
    responses(provider(), answer)
    expect((await refreshPageStudioDomain(input, vi.fn())).lifecycleState).not.toBe('active')
  })

  it('follows only a connected CNAME chain', async () => {
    responses(provider(), dns([cname(hostname, 'alias.example'), cname('alias.example', target)]))
    expect((await refreshPageStudioDomain(input, vi.fn())).lifecycleState).toBe('active')
  })

  it('requires TLS even after ownership and DNS verification', async () => {
    responses(provider({ ssl: { status: 'pending_validation' } }), dns([cname()]))
    expect((await refreshPageStudioDomain(input, vi.fn())).lifecycleState).not.toBe('active')
  })

  it('does not reactivate a domain detached while provider verification was running', async () => {
    responses(provider(), dns([cname()]))
    service.saveVerification.mockRejectedValueOnce(new PageStudioDomainAttachmentError('DOMAIN_CHANGED', 409, 'Domain changed'))
    await expect(refreshPageStudioDomain(input, vi.fn())).rejects.toMatchObject({ code: 'DOMAIN_CHANGED' })
    expect(service.saveVerification).toHaveBeenCalledTimes(1)
  })
})
