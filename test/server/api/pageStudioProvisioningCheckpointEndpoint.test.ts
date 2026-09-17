import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), commit: vi.fn(), runtime: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({ requirePageStudioMachineAuth: mocks.auth }))
vi.mock('~~/server/utils/pageStudio/provisioningCheckpoint', async original => ({
  ...await original<typeof import('~~/server/utils/pageStudio/provisioningCheckpoint')>(),
  commitPageStudioProvisioningCheckpoint: mocks.commit
}))
vi.mock('~~/server/utils/pageStudio/provisioningBinding', async original => ({
  ...await original<typeof import('~~/server/utils/pageStudio/provisioningBinding')>(),
  requirePageStudioProvisioningRuntime: mocks.runtime
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioInternalHttpError: (event: { status?: number }, error: { statusCode?: number }) => {
    event.status = error.statusCode ?? 500
    return { error: true }
  }
}))
const scope = { tenantId: 'test', clientId: '20000000-0000-4000-8000-000000000601', siteId: '10000000-0000-4000-8000-000000000601' }
const checkpointId = `setup_${'a'.repeat(64)}`
const input = {
  checkpoint: { checkpointId, scope, userId: '30000000-0000-4000-8000-000000000601',
    createdAt: '2026-09-18T00:00:00.000Z', digest: 'b'.repeat(64), etag: 'stored',
    objectKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${checkpointId}.json` },
  expectedCheckpointId: null,
  provisioning: { requestKey: `page-studio-${scope.siteId}-1`, scope: { ...scope, businessId: scope.clientId, environment: 'staging' } }
}
type TestEvent = { body: unknown, headers: Record<string, string>, context: { cloudflare: { env: Record<string, unknown> } }, status: number }
let read: ReturnType<typeof vi.fn>
let headers: Record<string, string>
let handler: (event: TestEvent) => Promise<unknown>
const binding = { readProvisioning: vi.fn() }
beforeEach(async () => {
  vi.resetAllMocks()
  headers = {}
  read = vi.fn(async (event: TestEvent) => event.body)
  vi.stubGlobal('eventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readBody', read)
  vi.stubGlobal('getHeader', (event: TestEvent, key: string) => event.headers[key])
  vi.stubGlobal('setHeader', (_event: unknown, key: string, value: string) => {
    headers[key] = value
  })
  vi.stubGlobal('createError', (error: object) => Object.assign(new Error(), error))
  handler = (await import('~~/server/routes/internal/page-studio/checkpoints/provisioning-commit.post')).default as unknown as (event: TestEvent) => Promise<unknown>
  mocks.runtime.mockReturnValue({ binding, environment: 'staging' })
  mocks.commit.mockResolvedValue({ acknowledged: true, checkpointId, currentCheckpointId: checkpointId, isCurrent: true })
})
afterEach(() => vi.unstubAllGlobals())
const event = (body: unknown = input, key = checkpointId) => ({ body, headers: { 'idempotency-key': key }, context: { cloudflare: { env: { test: true } } }, status: 200 })

describe('internal provisioning checkpoint endpoint', () => {
  it('passes only validated metadata and job reference to the retained-job transaction writer', async () => {
    const request = event()
    await expect(handler(request)).resolves.toMatchObject({ acknowledged: true })
    expect(mocks.auth).toHaveBeenCalledWith(request)
    expect(mocks.runtime).toHaveBeenCalledWith(request.context.cloudflare.env)
    expect(mocks.commit).toHaveBeenCalledWith(input, binding, 'staging')
    expect(headers['cache-control']).toBe('no-store')
  })
  it('authenticates before reading caller data or resolving bindings', async () => {
    mocks.auth.mockImplementation(() => {
      throw Object.assign(new Error(), { statusCode: 401 })
    })
    const request = event()
    await handler(request)
    expect(request.status).toBe(401)
    expect(read).not.toHaveBeenCalled()
    expect(mocks.runtime).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it.each([
    { ...input, provisioning: undefined },
    { ...input, provisioning: { ...input.provisioning, actor: { userId: input.checkpoint.userId } } },
    { ...input, provisioning: { ...input.provisioning, scope: { ...input.provisioning.scope, businessId: 'other' } } }
  ])('rejects missing or caller-injected authority context', async (body) => {
    const request = event(body)
    await handler(request)
    expect(request.status).toBe(400)
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it('rejects a mismatched operation identity', async () => {
    const request = event(input, 'other')
    await handler(request)
    expect(request.status).toBe(400)
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it('preserves transaction denial without falling back to a generic writer', async () => {
    mocks.commit.mockRejectedValue(Object.assign(new Error(), { statusCode: 403 }))
    const request = event()
    await handler(request)
    expect(request.status).toBe(403)
    expect(mocks.commit).toHaveBeenCalledTimes(1)
  })
})
