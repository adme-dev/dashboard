import { describe, expect, it, vi } from 'vitest'
import { requireRuntimeTarget, runtimeTargetPolicy } from '~~/server/utils/pageStudio/runtimeTarget'
import { readPageStudioRuntimeState } from '~~/server/utils/pageStudio/runtimeState'

vi.mock('~~/server/utils/db', () => ({ queryOne: vi.fn(), queryRows: vi.fn(), transaction: vi.fn() }))

const first = { tenantId: 'synthetic-a', clientId: '10000000-0000-4000-8000-000000000001', siteId: 'a27135dc-1374-475c-a56d-7e60310425bb', hostname: 'page-studio-staging.xeroflow.io' }
const second = { tenantId: 'synthetic-b', clientId: '10000000-0000-4000-8000-000000000002', siteId: '5ddc69f4-bd4f-4179-ba6f-e23412133cb0', hostname: 'cms-second-staging.xeroflow.io' }
const scope = ({ hostname: _hostname, ...value }: typeof first) => value
const env = (canaries: unknown = [first, second]) => ({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_RUNTIME_STAGING_CANARIES: JSON.stringify(canaries) })
const db = (synthetic = true, ready = false) => ({ query: vi.fn(async (sql: string) => ({ rows: sql.includes('page_studio_staging_sites') ? (ready ? [{ site_id: first.siteId }] : []) : sql.includes('integrations->>\'synthetic\'=\'true\'') && synthetic ? [{ id: first.siteId }] : [] })) })
const request = (canary = first) => ({ environment: 'staging' as const, hostname: canary.hostname, scope: scope(canary) })

async function state(options: { canary?: typeof first, synthetic?: boolean, deployment?: string, environment?: 'staging' | 'production', ready?: string, pointer?: string, deliveryMode?: 'runtime' | 'static', config?: Record<string, unknown> } = {}) {
  const one = vi.fn()
    .mockResolvedValueOnce({ delivery_mode: options.deliveryMode ?? 'runtime', synthetic: options.synthetic ?? true, checkpoint_id: null, digest: null, saved_at: null })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(options.pointer ? { normalized_hostname: options.pointer } : null)
    .mockResolvedValueOnce(options.ready ? { hostname: options.ready } : null)
  return readPageStudioRuntimeState(scope(options.canary ?? second), { ...env(), PAGE_STUDIO_RELEASE_ENVIRONMENT: options.deployment ?? 'staging', ...options.config },
    { queryOne: one as never, queryRows: vi.fn().mockResolvedValue([]) as never, ...(options.environment ? { environment: options.environment } : {}) })
}

describe('bounded synthetic runtime staging canaries', () => {
  it.each([first, second])('admits each exact synthetic scope independently: $tenantId', async (canary) => {
    await expect(requireRuntimeTarget(db() as never, request(canary), runtimeTargetPolicy(env()))).resolves.toBeUndefined()
  })
  it('accepts exactly four distinct synthetic scopes', () => {
    const entries = Array.from({ length: 4 }, (_, index) => ({ ...first, hostname: `canary-${index}.example.com`, tenantId: `tenant-${index}` }))
    expect(runtimeTargetPolicy(env(entries)).stagingCanaries).toHaveLength(4)
  })
  it('retains legacy single-canary configuration', async () => {
    const policy = runtimeTargetPolicy({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_RUNTIME_STAGING_CANARY: JSON.stringify(first) })
    await expect(requireRuntimeTarget(db() as never, request(), policy)).resolves.toBeUndefined()
    await expect(requireRuntimeTarget(db() as never, request(second), policy)).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
  })
  it.each([
    { label: 'tenant', change: { tenantId: 'other' } }, { label: 'client', change: { clientId: second.clientId } },
    { label: 'site', change: { siteId: second.siteId } }, { label: 'hostname', change: { hostname: second.hostname } }
  ])('denies a substituted $label', async ({ change }) => {
    await expect(requireRuntimeTarget(db() as never, request({ ...first, ...change }), runtimeTargetPolicy(env()))).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
  })
  it('denies non-synthetic sites and removed grants', async () => {
    await expect(requireRuntimeTarget(db(false) as never, request(), runtimeTargetPolicy(env()))).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
    await expect(requireRuntimeTarget(db() as never, request(), runtimeTargetPolicy(env([second])))).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
    await expect(requireRuntimeTarget(db() as never, request(second), runtimeTargetPolicy(env([second])))).resolves.toBeUndefined()
  })
  it('never grants canary access from production or to a production target', async () => {
    await expect(requireRuntimeTarget(db() as never, request(), runtimeTargetPolicy({ ...env(), PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }))).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
    await expect(requireRuntimeTarget(db() as never, { ...request(), environment: 'production' }, runtimeTargetPolicy(env()))).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
  })
  it('preserves provider-verified ordinary staging without a canary grant', async () => {
    await expect(requireRuntimeTarget(db(false, true) as never, request(), runtimeTargetPolicy({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }))).resolves.toBeUndefined()
  })
  it.each([
    ['empty', []], ['too many', Array.from({ length: 5 }, (_, index) => ({ ...first, hostname: `canary-${index}.example.com`, tenantId: `tenant-${index}` }))], ['duplicate hostname', [first, { ...second, hostname: first.hostname.toUpperCase() }]],
    ['duplicate scope', [first, { ...first, hostname: second.hostname }]], ['invalid hostname', [{ ...first, hostname: 'https://invalid.example/' }]],
    ['unknown key', [{ ...first, wildcard: true }]], ['missing field', [{ ...first, siteId: undefined }]], ['not an array', first]
  ])('rejects %s configuration', (_name, value) => {
    expect(() => runtimeTargetPolicy(env(value))).toThrow()
  })
  it('rejects malformed, non-string and simultaneously configured legacy/plural values', () => {
    for (const value of ['[', null, {}, 42]) expect(() => runtimeTargetPolicy({ ...env(), PAGE_STUDIO_RUNTIME_STAGING_CANARIES: value })).toThrow()
    expect(() => runtimeTargetPolicy({ ...env(), PAGE_STUDIO_RUNTIME_STAGING_CANARY: JSON.stringify(first) })).toThrow()
    expect(() => runtimeTargetPolicy({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_RUNTIME_STAGING_CANARY: null })).toThrow()
  })
})

describe('native publish UI synthetic hostname fallback', () => {
  it('shows the exact second canary before any release pointer exists', async () => {
    expect((await state()).hostname).toBe(second.hostname)
  })
  it('supports the legacy hostname fallback', async () => {
    expect((await state({ canary: first, config: { PAGE_STUDIO_RUNTIME_STAGING_CANARIES: undefined, PAGE_STUDIO_RUNTIME_STAGING_CANARY: JSON.stringify(first) } })).hostname).toBe(first.hostname)
  })
  it.each([
    { synthetic: false }, { deployment: 'production', environment: 'staging' as const }, { deliveryMode: 'static' as const },
    { canary: { ...second, tenantId: 'other' } }, { config: { PAGE_STUDIO_RUNTIME_STAGING_CANARIES: JSON.stringify([first]) } }
  ])('does not expose an ungranted synthetic hostname: %j', async (options) => {
    expect((await state(options)).hostname).toBeNull()
  })
  it('preserves ready provider and existing pointer hostname precedence', async () => {
    expect((await state({ ready: 'ready.example', pointer: 'pointer.example' })).hostname).toBe('ready.example')
    expect((await state({ pointer: 'pointer.example' })).hostname).toBe('pointer.example')
  })
  it('fails closed on ambiguous synthetic fallback configuration', async () => {
    await expect(state({ config: { PAGE_STUDIO_RUNTIME_STAGING_CANARY: JSON.stringify(first) } })).rejects.toThrow()
  })
})
