import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  prepare: vi.fn(),
  principal: vi.fn(),
  requireAccess: vi.fn(),
  resolveClient: vi.fn(),
  rollback: vi.fn(),
  withAuthority: vi.fn()
}))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: (...a: unknown[]) => mocks.requireAccess(...a) }))
vi.mock('~~/server/utils/pageStudio/versions', () => ({ resolveAgencyPageStudioSiteClient: (...a: unknown[]) => mocks.resolveClient(...a) }))
vi.mock('~~/server/utils/pageStudio/publishHttp', () => ({ preparePageStudioPublishPrincipal: (...a: unknown[]) => mocks.principal(...a) }))
vi.mock('~~/server/utils/pageStudio/publishAuthority', () => ({ withPageStudioPublishAuthority: (...a: unknown[]) => mocks.withAuthority(...a) }))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioHttpError: (error: unknown) => {
    throw error
  }
}))
vi.mock('~~/server/utils/pageStudio/runtimePublishing', () => ({
  activatePageStudioRuntimeRelease: (...a: unknown[]) => mocks.activate(...a),
  rollbackPageStudioRuntimeRelease: (...a: unknown[]) => mocks.rollback(...a)
}))
vi.mock('~~/server/utils/pageStudio/runtimeReleases', async original => ({
  ...await original<typeof import('~~/server/utils/pageStudio/runtimeReleases')>(),
  preparePageStudioRuntimeRelease: (...a: unknown[]) => mocks.prepare(...a)
}))

type TestEvent = { body?: unknown, context: Record<string, unknown>, headers?: Record<string, string>, params?: Record<string, string> }
const g = globalThis as Record<string, unknown>
g.createError = (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input)
g.eventHandler = <T>(handler: T) => handler
g.getHeader = (event: TestEvent, key: string) => event.headers?.[key]
g.getRouterParam = (event: TestEvent, key: string) => event.params?.[key]
g.readBody = async (event: TestEvent) => event.body

const siteId = '11111111-1111-4111-8111-111111111111'
const renderer = { assetsDigest: 'a'.repeat(64), codeDigest: 'b'.repeat(64), generation: 'renderer_two' }
const bucket = { get: vi.fn(), put: vi.fn() }
const event = (body: unknown, env: Record<string, unknown> = {}): TestEvent => ({
  body,
  context: { cloudflare: { env: { PAGE_STUDIO_CHECKPOINTS: bucket, PAGE_STUDIO_RUNTIME_RENDERER: JSON.stringify(renderer), ...env } } },
  headers: { 'idempotency-key': 'publish-1' },
  params: { siteId }
})

describe('runtime release routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAccess.mockResolvedValue({ tenantId: 'tenant', user: { id: 'user-1' } })
    mocks.resolveClient.mockResolvedValue('client-1')
    mocks.principal.mockResolvedValue({ principal: true })
    mocks.withAuthority.mockImplementation(async (_scope: unknown, _principal: unknown, work: () => unknown) => work())
    mocks.prepare.mockResolvedValue({ prepared: true })
    mocks.activate.mockResolvedValue({ releaseId: 'r2' })
    mocks.rollback.mockResolvedValue({ releaseId: 'r1' })
  })

  it('prepares then activates the requested version under publish authority', async () => {
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/activate.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'production', expectedActiveReleaseId: null, hostname: 'www.site.example', versionId: '22222222-2222-4222-8222-222222222222' }
    await expect(handler(event(body))).resolves.toEqual({ release: { releaseId: 'r2' } })
    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.anything(), 'PAGE_STUDIO_PUBLISH')
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ bucket, environment: 'production', renderer: { ...renderer, name: 'astro-runtime' }, versionId: body.versionId }))
    expect(mocks.activate).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'user-1', idempotencyKey: 'publish-1', prepared: { prepared: true } }), expect.anything())
    expect(mocks.activate.mock.calls[0][1]).toEqual({ runTransaction: expect.any(Function) })
  })

  it('rejects malformed input and an unconfigured renderer before touching content', async () => {
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/activate.post')).default as (e: TestEvent) => Promise<unknown>
    await expect(handler(event({ environment: 'preview', hostname: 'x', versionId: 'nope' }))).rejects.toMatchObject({ statusCode: 400 })
    const body = { environment: 'production', expectedActiveReleaseId: null, hostname: 'www.site.example', versionId: '22222222-2222-4222-8222-222222222222' }
    await expect(handler(event(body, { PAGE_STUDIO_RUNTIME_RENDERER: undefined }))).rejects.toMatchObject({ code: 'RUNTIME_RENDERER_UNAVAILABLE' })
    expect(mocks.prepare).not.toHaveBeenCalled()
  })

  it('rolls back with the current and retained renderer generations', async () => {
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/rollback.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'production', expectedActiveReleaseId: '33333333-3333-4333-8333-333333333333', hostname: 'www.site.example', targetReleaseId: '44444444-4444-4444-8444-444444444444' }
    await expect(handler(event(body, { PAGE_STUDIO_RUNTIME_RETAINED_GENERATIONS: 'renderer_one, renderer_zero' }))).resolves.toEqual({ release: { releaseId: 'r1' } })
    expect(mocks.rollback).toHaveBeenCalledWith(expect.objectContaining({ retainedGenerations: ['renderer_two', 'renderer_one', 'renderer_zero'], targetReleaseId: body.targetReleaseId }), expect.anything())
  })
})
