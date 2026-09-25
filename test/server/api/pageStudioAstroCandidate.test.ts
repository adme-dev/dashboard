import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), client: vi.fn(), principal: vi.fn(), services: vi.fn(), build: vi.fn(), preview: vi.fn(), session: vi.fn(), sessionEnvironment: vi.fn(), sign: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/pageStudio/versions', () => ({ resolveAgencyPageStudioSiteClient: mocks.client }))
vi.mock('~~/server/utils/pageStudio/publishHttp', () => ({ preparePageStudioPublishPrincipal: mocks.principal }))
vi.mock('~~/server/utils/pageStudio/astroBuildHttp', () => ({ resolveAstroBuildServices: mocks.services }))
vi.mock('~~/server/utils/pageStudio/astroBuildCoordinator', () => ({ coordinateApprovedAstroBuild: mocks.build }))
vi.mock('~~/server/utils/pageStudio/astroCandidatePreview', () => ({ registerAstroCandidatePreview: mocks.preview }))
vi.mock('~~/server/utils/pageStudio/astroCandidateSession', () => ({ issueAstroCandidateSession: mocks.session }))
vi.mock('~~/server/utils/pageStudio/sessions', () => ({ resolvePageStudioSessionEnvironment: mocks.sessionEnvironment, signPageStudioSessionToken: mocks.sign }))
vi.mock('~~/server/utils/pageStudio/http', () => ({ pageStudioHttpError: (error: unknown) => {
  throw error
} }))

const siteId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const versionId = '33333333-3333-4333-8333-333333333333'
const principal = { actorId: 'user', tenantId: 'tenant', login: {} }
const services = { verifyBuild: vi.fn() }
const event = () => ({ params: { siteId, versionId }, body: { environment: 'production' }, headers: { 'idempotency-key': 'candidate-request' }, context: {
  cloudflare: { env: { PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME: 'review.example.invalid' } }
} })
type Event = ReturnType<typeof event>
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (input: Event, key: keyof Event['params']) => input.params[key])
vi.stubGlobal('getHeader', (input: Event, key: keyof Event['headers']) => input.headers[key])
vi.stubGlobal('readBody', async (input: Event) => input.body)
vi.stubGlobal('setResponseHeader', vi.fn())
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input))

describe('approved Astro candidate preparation endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ tenantId: 'tenant', user: { id: 'user' } })
    mocks.client.mockResolvedValue(clientId)
    mocks.principal.mockResolvedValue(principal)
    mocks.services.mockReturnValue({ environment: 'production', services })
    mocks.build.mockResolvedValue({ buildId: 'astro_candidate' })
    mocks.preview.mockResolvedValue({ hostname: 'candidate.review.example.invalid', release: { buildId: 'astro_candidate' } })
    mocks.sessionEnvironment.mockReturnValue({ issuer: 'https://agency.example.invalid', privateKey: 'configured-key' })
    mocks.session.mockResolvedValue({ token: 'review-only-token', capabilities: ['workspace:preview'] })
  })
  const invoke = async (input: Event) => (await import('~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/candidate.post')).default(input as never)

  it('prepares from the approved server checkpoint and registers the same build without activation', async () => {
    const input = event()
    const response = await invoke(input)
    const scope = { tenantId: 'tenant', clientId, siteId }
    expect(mocks.access).toHaveBeenCalledWith(input, 'PAGE_STUDIO_PUBLISH')
    expect(mocks.build).toHaveBeenCalledWith({ scope, versionId, environment: 'production', idempotencyKey: 'candidate-request' }, principal, services, { recoverCandidate: true })
    expect(mocks.preview).toHaveBeenCalledWith({ scope, versionId, environment: 'production', buildId: 'astro_candidate', previewHostname: 'review.example.invalid' }, principal, { verifyBuild: expect.any(Function) })
    expect(response).toEqual({ build: { buildId: 'astro_candidate' }, preview: { hostname: 'candidate.review.example.invalid', release: { buildId: 'astro_candidate' } }, session: { token: 'review-only-token', capabilities: ['workspace:preview'] } })
    expect(mocks.session).toHaveBeenCalledWith(scope, principal, { signToken: expect.any(Function) })
  })
  it.each(['wrong environment', 'missing preview config', 'untrusted manifest', 'untrusted hostname', 'missing idempotency'])('rejects %s before compiler work', async (scenario) => {
    const input = event()
    if (scenario === 'wrong environment') input.body.environment = 'staging'
    if (scenario === 'missing preview config') input.context.cloudflare.env.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME = ''
    if (scenario === 'untrusted manifest') Object.assign(input.body, { manifest: {} })
    if (scenario === 'untrusted hostname') Object.assign(input.body, { previewHostname: 'evil.invalid' })
    if (scenario === 'missing idempotency') input.headers['idempotency-key'] = ''
    await expect(invoke(input)).rejects.toThrow()
    expect(mocks.build).not.toHaveBeenCalled()
    expect(mocks.preview).not.toHaveBeenCalled()
  })
  it('captures the original principal before asynchronous compiler work', async () => {
    mocks.build.mockImplementation(async (_input, observed) => {
      expect(observed).toBe(principal)
      expect(mocks.principal).toHaveBeenCalledTimes(1)
      throw new Error('Compiler disconnected')
    })
    await expect(invoke(event())).rejects.toThrow('Compiler disconnected')
    expect(mocks.preview).not.toHaveBeenCalled()
  })
})
