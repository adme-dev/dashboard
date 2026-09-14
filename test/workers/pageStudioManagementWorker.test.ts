import { beforeEach, describe, expect, it, vi } from 'vitest'
import Management from '../../workers/page-studio-management/src/index'
import { PageStudioEmailConfigurationError } from '../../shared/pageStudio/emailConfigurationContract'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), transaction: vi.fn() }))
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {
  env: unknown

  constructor(_ctx: unknown, env: unknown) { this.env = env }
} }))
vi.mock('../../workers/page-studio-management/src/emailConfiguration', () => ({ readPageStudioEmailConfiguration: mocks.read, writePageStudioEmailConfiguration: mocks.write }))
vi.mock('../../workers/page-studio-management/src/database', () => ({ withManagementTransaction: mocks.transaction }))
const siteId = '10000000-0000-4000-8000-000000000001'
const actor = { role: 'client', actorId: '10000000-0000-4000-8000-000000000002', clientId: '10000000-0000-4000-8000-000000000003' }
const request = { operation: 'read', actor, siteId, expectedEnvironment: 'staging' }
const state = { siteId, environment: 'staging', revision: 0, settings: null, updatedAt: null, canEdit: false, readiness: { status: 'not_configured', sendingEnabled: false, forwardingEnabled: false, senderVerification: 'unverified', message: 'Preferences only.' } }
const settings = { senderName: 'Synthetic business', fromAddress: 'sender@example.invalid', replyTo: 'reply@example.invalid', notificationRecipient: 'notify@example.invalid', inboundAddress: '', forwardingDestination: '' }
const unavailable = { ok: false, error: { code: 'EMAIL_SERVICE_UNAVAILABLE', statusCode: 503, message: 'Website email settings service is unavailable' } }
function worker(env: unknown = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', HYPERDRIVE_FRESH: { connectionString: 'synthetic-local-only' } }) {
  return new Management({} as never, env as never)
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.read.mockResolvedValue(state)
  mocks.write.mockResolvedValue(state)
})
describe('management Worker request and business boundary', () => {
  it.each([null, [], {}, { ...request, extra: true }, { ...request, siteId: 'invalid' }, { ...request, expectedEnvironment: 'preview' }, { ...request, actor: { ...actor, canEdit: true } }, { ...request, actor: { ...actor, role: 'visitor' } }, { ...request, actor: { ...actor, clientId: undefined } }, { ...request, actor: { role: 'agency', actorId: actor.actorId, tenantId: 'tenant' } }, { ...request, operation: 'write' }, { ...request, operation: 'write', body: { expectedRevision: 0, settings, extra: true } }])('rejects malformed input before business or database execution', async (input) => {
    expect(await worker().emailSettings(input)).toEqual({ ok: false, error: { code: 'EMAIL_INVALID', statusCode: 400, message: 'Invalid website email settings request' } })
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each([{}, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', HYPERDRIVE_FRESH: { connectionString: 'synthetic' } }, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', HYPERDRIVE_FRESH: {} }, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'preview', HYPERDRIVE_FRESH: { connectionString: 'synthetic' } }])('rejects environment mismatch or missing fresh connection before business work', async (env) => {
    expect(await worker(env).emailSettings(request)).toEqual({ ok: false, error: { code: 'EMAIL_NOT_CONFIGURED', statusCode: 503, message: 'Website email settings environment is unavailable' } })
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('passes a validated client read to current-authority business logic with injected transaction', async () => {
    expect(await worker().emailSettings(request)).toEqual({ ok: true, value: state })
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ actor, siteId, env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' } }, { transaction: expect.any(Function) })
    const callback = vi.fn()
    await mocks.read.mock.calls[0]![1].transaction(callback)
    expect(mocks.transaction).toHaveBeenCalledExactlyOnceWith('synthetic-local-only', callback)
  })
  it('forwards an agency write unchanged and does not retry a business conflict', async () => {
    const agency = { role: 'agency', actorId: actor.actorId, tenantId: 'selected', canEdit: true }
    const body = { expectedRevision: 4, settings }
    mocks.write.mockRejectedValue(new PageStudioEmailConfigurationError('EMAIL_CONFLICT', 409, 'Email settings changed. Reload before saving again.'))
    expect(await worker().emailSettings({ ...request, operation: 'write', actor: agency, body })).toEqual({ ok: false, error: { code: 'EMAIL_CONFLICT', statusCode: 409, message: 'Email settings changed. Reload before saving again.' } })
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith({ actor: agency, siteId, env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, body }, { transaction: expect.any(Function) })
  })
  it('returns a validated successful write without altering saved values', async () => {
    const saved = { ...state, revision: 1, settings, updatedAt: '2026-09-15T00:00:00.000Z', readiness: { ...state.readiness, status: 'setup_required' } }
    mocks.write.mockResolvedValue(saved)
    expect(await worker().emailSettings({ ...request, operation: 'write', body: { expectedRevision: 0, settings } })).toEqual({ ok: true, value: saved })
    expect(mocks.write).toHaveBeenCalledOnce()
  })
  it.each([null, { ...state, extra: 'private' }, { ...state, readiness: { ...state.readiness, sendingEnabled: true } }])('does not expose malformed business results', async (value) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.read.mockResolvedValue(value)
      expect(await worker().emailSettings(request)).toEqual(unavailable)
    } finally {
      log.mockRestore()
    }
  })
  it('redacts unexpected failures and never retries uncertain writes', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.write.mockRejectedValue(new Error('postgresql://private:password@production/db'))
      expect(await worker().emailSettings({ ...request, operation: 'write', body: { expectedRevision: 0, settings } })).toEqual(unavailable)
      expect(mocks.write).toHaveBeenCalledOnce()
      expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: 'page_studio_management_failure', operation: 'write', environment: 'staging' }))
    } finally {
      log.mockRestore()
    }
  })
  it('has no public HTTP management surface', async () => {
    const response = worker().fetch()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })
})
