import { readFileSync } from 'node:fs'
import cmsFixture from '../../fixtures/pageStudioCmsGraph.json'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  activateFeature: vi.fn(), rollbackFeature: vi.fn(), nativePrincipal: vi.fn(), sealed: vi.fn(), checkpoint: vi.fn(),
  prepare: vi.fn(),
  principal: vi.fn(),
  requireAccess: vi.fn(),
  resolveClient: vi.fn(),
  rollback: vi.fn(),
  withAuthority: vi.fn()
}))
vi.mock('~~/server/utils/pageStudio/runtimeFeatureActivation', () => ({ activateRuntimeFeature: mocks.activateFeature }))
vi.mock('~~/server/utils/pageStudio/runtimeFeatureRollback', () => ({ rollbackRuntimeFeature: mocks.rollbackFeature }))
vi.mock('~~/server/utils/pageStudio/releaseFeatureHttp', () => ({ nativeFeaturePublisher: mocks.nativePrincipal, hasRuntimeFeatureSeal: mocks.sealed }))
vi.mock('~~/server/utils/pageStudio/releaseCheckpoint', async original => ({ ...await original<object>(), loadApprovedPageStudioReleaseCheckpoint: mocks.checkpoint }))
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
  context: { cloudflare: { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CHECKPOINTS: bucket, PAGE_STUDIO_RUNTIME_RENDERER: JSON.stringify(renderer), ...env } } },
  headers: { 'idempotency-key': 'publish-1' },
  params: { siteId }
})

describe('runtime release routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAccess.mockResolvedValue({ tenantId: 'tenant', user: { id: 'user-1' } })
    mocks.resolveClient.mockResolvedValue('10000000-0000-4000-8000-000000000001')
    mocks.principal.mockResolvedValue({ principal: true })
    mocks.withAuthority.mockImplementation(async (_scope: unknown, _principal: unknown, work: () => unknown) => work())
    mocks.checkpoint.mockResolvedValue({ manifest: { schemaVersion: 2, pages: [] } })
    mocks.sealed.mockResolvedValue(false)
    mocks.nativePrincipal.mockResolvedValue({ native: true })
    mocks.activateFeature.mockResolvedValue({ releaseId: 'cms-r2' })
    mocks.rollbackFeature.mockResolvedValue({ releaseId: 'cms-r1' })
    mocks.prepare.mockResolvedValue({ prepared: true })
    mocks.activate.mockResolvedValue({ releaseId: 'r2' })
    mocks.rollback.mockResolvedValue({ releaseId: 'r1' })
  })

  it('prepares then activates the requested version under publish authority', async () => {
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/activate.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'production', expectedActiveReleaseId: null, hostname: 'www.site.example', versionId: '22222222-2222-4222-8222-222222222222' }
    await expect(handler(event(body))).resolves.toEqual({ release: { releaseId: 'r2' } })
    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.anything(), 'PAGE_STUDIO_PUBLISH')
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ bucket, environment: 'production', renderer: { ...renderer, name: 'astro-runtime' }, versionId: body.versionId }), { loadCheckpoint: expect.any(Function) })
    expect(mocks.activate).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'user-1', idempotencyKey: 'publish-1', prepared: { prepared: true } }), expect.anything())
    expect(mocks.activate.mock.calls[0][1]).toEqual({ policy: { deploymentEnvironment: 'production' }, runTransaction: expect.any(Function) })
  })

  it('routes CMS publication through the atomic feature coordinator', async () => {
    mocks.checkpoint.mockResolvedValue({ manifest: { schemaVersion: 2, builderLibrary: { components: [{}] } } })
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/activate.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'production', expectedActiveReleaseId: null, hostname: 'www.site.example', versionId: '22222222-2222-4222-8222-222222222222' }
    expect(await handler(event(body, { PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS: JSON.stringify([{
      scope: { tenantId: 'tenant', clientId: '10000000-0000-4000-8000-000000000001', siteId },
      environment: 'production', renderer: { ...renderer, name: 'astro-runtime' }
    }]) }))).toEqual({ release: { releaseId: 'cms-r2' } })
    expect(mocks.activateFeature).toHaveBeenCalledWith(expect.objectContaining({ preparation: expect.objectContaining({ versionId: body.versionId }), actorId: 'user-1' }), { native: true }, { policy: { deploymentEnvironment: 'production' } })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })
  it('rejects a real generated CMS checkpoint with the deployed production renderer before publication', async () => {
    mocks.checkpoint.mockResolvedValue({ manifest: cmsFixture.nextCheckpoint.manifest })
    const config = readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8')
    const section = config.split('[env.production.vars]')[1]!.split('\n[')[0]!
    const variables = Object.fromEntries([...section.matchAll(/^(PAGE_STUDIO_RUNTIME_[A-Z_]+) = (".*")$/gm)].map(match => [match[1], JSON.parse(match[2]!)]))
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/activate.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'production', expectedActiveReleaseId: null, hostname: 'www.site.example', versionId: '22222222-2222-4222-8222-222222222222' }
    await expect(handler(event(body, variables))).rejects.toMatchObject({ code: 'RUNTIME_CMS_NOT_ADMITTED', statusCode: 503 })
    expect(mocks.activateFeature).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it('rejects generated action forms at the runtime route even with an admitted CMS renderer', async () => {
    const manifest = structuredClone(cmsFixture.nextCheckpoint.manifest)
    Object.assign(manifest.pages[0]!, { forms: [{ id: 'contact', name: 'Contact', fields: [{ id: 'title', name: 'Title', type: 'text', required: true }],
      submission: { mode: 'action', version: 1, trigger: 'form-submit', action: manifest.builderApplication.actions[0], mappings: [{ conversion: 'string', fieldId: 'title', inputKey: 'title' }] } }] })
    mocks.checkpoint.mockResolvedValue({ manifest })
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/activate.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'production', expectedActiveReleaseId: null, hostname: 'www.site.example', versionId: '22222222-2222-4222-8222-222222222222' }
    await expect(handler(event(body, { PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS: JSON.stringify([{ scope: { tenantId: 'tenant', clientId: '10000000-0000-4000-8000-000000000001', siteId }, environment: 'production', renderer: { ...renderer, name: 'astro-runtime' } }]) }))).rejects.toMatchObject({ code: 'RUNTIME_ACTION_FORMS_UNAVAILABLE', statusCode: 422 })
    expect(mocks.activateFeature).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it('routes retained CMS rollback through a fresh feature activation', async () => {
    mocks.sealed.mockResolvedValue(true)
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/rollback.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'production', expectedActiveReleaseId: '33333333-3333-4333-8333-333333333333', hostname: 'www.site.example', targetReleaseId: '44444444-4444-4444-8444-444444444444' }
    expect(await handler(event(body))).toEqual({ release: { releaseId: 'cms-r1' } })
    expect(mocks.rollbackFeature).toHaveBeenCalledWith(expect.objectContaining({ targetReleaseId: body.targetReleaseId }), { native: true }, { policy: { deploymentEnvironment: 'production' } })
    expect(mocks.rollback).not.toHaveBeenCalled()
  })
  it('rejects malformed input and an unconfigured renderer before touching content', async () => {
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/activate.post')).default as (e: TestEvent) => Promise<unknown>
    await expect(handler(event({ environment: 'preview', hostname: 'x', versionId: 'nope' }))).rejects.toMatchObject({ statusCode: 400 })
    const body = { environment: 'production', expectedActiveReleaseId: null, hostname: 'www.site.example', versionId: '22222222-2222-4222-8222-222222222222' }
    await expect(handler(event(body, { PAGE_STUDIO_RUNTIME_RENDERER: undefined }))).rejects.toMatchObject({ code: 'RUNTIME_RENDERER_UNAVAILABLE' })
    expect(mocks.prepare).not.toHaveBeenCalled()
  })

  it('rejects a production target on staging before preparing content', async () => {
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/activate.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'production', expectedActiveReleaseId: null, hostname: 'www.site.example', versionId: '22222222-2222-4222-8222-222222222222' }
    await expect(handler(event(body, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it('rolls back with the current and retained renderer generations', async () => {
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/rollback.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'production', expectedActiveReleaseId: '33333333-3333-4333-8333-333333333333', hostname: 'www.site.example', targetReleaseId: '44444444-4444-4444-8444-444444444444' }
    await expect(handler(event(body, { PAGE_STUDIO_RUNTIME_RETAINED_GENERATIONS: 'renderer_one, renderer_zero' }))).resolves.toEqual({ release: { releaseId: 'r1' } })
    expect(mocks.rollback).toHaveBeenCalledWith(expect.objectContaining({ retainedGenerations: ['renderer_two', 'renderer_one', 'renderer_zero'], targetReleaseId: body.targetReleaseId }), expect.anything())
  })

  it.each([
    ['production', 'astro_runtime_a6a72b897cb1ddde19c975a711a37da398e7e00fbc72847a2b92ea30e8d43ac6'],
    ['preview', 'astro_runtime_a71fb2968a783bc114ee9a340ff7ff60a6c74ab442d49fa360464b5f4fac2f27']
  ])('keeps the existing %s publication restorable after a renderer upgrade', async (environment, previousGeneration) => {
    const config = readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8')
    const section = config.split(`[env.${environment}.vars]`)[1]!.split('\n[')[0]!
    const variables = Object.fromEntries([...section.matchAll(/^(PAGE_STUDIO_RUNTIME_[A-Z_]+) = (".*")$/gm)]
      .map(match => [match[1], JSON.parse(match[2]!)]))
    const handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/runtime-releases/rollback.post')).default as (e: TestEvent) => Promise<unknown>
    const body = { environment: 'staging', expectedActiveReleaseId: '33333333-3333-4333-8333-333333333333', hostname: 'www.site.example', targetReleaseId: '44444444-4444-4444-8444-444444444444' }
    await handler(event(body, variables))
    expect(mocks.rollback.mock.calls[0][0].retainedGenerations).toContain(previousGeneration)
    if (environment === 'preview') expect(mocks.rollback.mock.calls[0][0].retainedGenerations).toContain('astro_runtime_21b84e1cde3f8be3')
  })
})
