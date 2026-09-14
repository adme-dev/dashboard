import { describe, expect, it, vi } from 'vitest'
import { readPageStudioEmailConfiguration, writePageStudioEmailConfiguration } from '~~/server/utils/pageStudio/emailConfiguration'

const siteId = '10000000-0000-4000-8000-000000000001'
const actorId = '10000000-0000-4000-8000-000000000003'
const settings = { senderName: 'Synthetic business', fromAddress: 'sender@example.invalid', replyTo: 'reply@example.invalid', notificationRecipient: 'notify@example.invalid', inboundAddress: '', forwardingDestination: '' }
const state = () => ({ siteId, environment: 'staging', revision: 0, settings: null, updatedAt: null, canEdit: true, readiness: { status: 'not_configured', sendingEnabled: false, forwardingEnabled: false, senderVerification: 'unverified', message: 'Preferences only.' } })
function setup(value: unknown = { ok: true, value: state() }) {
  const emailSettings = vi.fn().mockResolvedValue(value)
  return { emailSettings, request: { siteId, actor: { role: 'agency' as const, actorId, tenantId: 'selected', canEdit: true }, env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_MANAGEMENT: { emailSettings } } } }
}
const unavailable = { code: 'EMAIL_SERVICE_UNAVAILABLE', statusCode: 503, message: 'Website email settings service is unavailable' }
describe('private management Pages client', () => {
  it('preserves the read business response and sends only authenticated actor/site/environment', async () => {
    const { request, emailSettings } = setup()
    expect(await readPageStudioEmailConfiguration(request)).toEqual(state())
    expect(emailSettings).toHaveBeenCalledExactlyOnceWith({ actor: request.actor, siteId, expectedEnvironment: 'staging', operation: 'read' })
  })
  it('preserves a successful settings revision and sends the unchanged CAS body once', async () => {
    const saved = { ...state(), revision: 1, settings, updatedAt: '2026-09-15T00:00:00.000Z', readiness: { ...state().readiness, status: 'setup_required' } }
    const { request, emailSettings } = setup({ ok: true, value: saved })
    const body = { expectedRevision: 0, settings }
    expect(await writePageStudioEmailConfiguration({ ...request, body })).toEqual(saved)
    expect(emailSettings).toHaveBeenCalledExactlyOnceWith({ actor: request.actor, siteId, expectedEnvironment: 'staging', operation: 'write', body })
  })
  it.each([undefined, null, {}, { emailSettings: 'invalid' }])('fails closed when the private binding is unavailable', async (binding) => {
    const { request, emailSettings } = setup()
    await expect(readPageStudioEmailConfiguration({ ...request, env: { ...request.env, PAGE_STUDIO_MANAGEMENT: binding } })).rejects.toMatchObject(unavailable)
    expect(emailSettings).not.toHaveBeenCalled()
  })
  it.each(['preview', '', undefined, 'PRODUCTION'])('rejects unconfigured environment before RPC: %s', async (environment) => {
    const { request, emailSettings } = setup()
    await expect(readPageStudioEmailConfiguration({ ...request, env: { ...request.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: environment } })).rejects.toMatchObject(unavailable)
    expect(emailSettings).not.toHaveBeenCalled()
  })
  it.each([null, 'secret', [], {}, { ok: true }, { ok: true, value: state(), extra: 'secret' }, { ok: true, value: { ...state(), extra: 'secret' } }, { ok: true, value: { ...state(), siteId: '20000000-0000-4000-8000-000000000001' } }, { ok: true, value: { ...state(), environment: 'production' } }, { ok: true, value: { ...state(), readiness: { ...state().readiness, sendingEnabled: true } } }])('rejects malformed, extra, foreign or enabled provider state', async (response) => {
    const { request, emailSettings } = setup(response)
    await expect(readPageStudioEmailConfiguration(request)).rejects.toMatchObject(unavailable)
    expect(emailSettings).toHaveBeenCalledOnce()
  })
  it.each([
    { ok: false, error: { code: 'EMAIL_CONFLICT', statusCode: 500, message: 'secret' } },
    { ok: false, error: { code: 'EMAIL_UNKNOWN', statusCode: 503, message: 'secret' } },
    { ok: false, error: { code: 'EMAIL_CONFLICT', statusCode: 409, message: 'secret\nraw' } },
    { ok: false, error: { code: 'EMAIL_CONFLICT', statusCode: 409, message: '' } },
    { ok: false, error: { code: 'EMAIL_CONFLICT', statusCode: 409, message: 'x'.repeat(501) } },
    { ok: false, error: { code: 'EMAIL_CONFLICT', statusCode: 409, message: 'Conflict', details: 'secret' } },
    { ok: false, error: { code: 'EMAIL_CONFLICT', statusCode: 409, message: 'Conflict' }, extra: true }
  ])('rejects untrusted error envelope shapes and code/status mismatches', async (response) => {
    await expect(readPageStudioEmailConfiguration(setup(response).request)).rejects.toMatchObject(unavailable)
  })
  it('retains a valid business conflict without retrying or disguising it as success', async () => {
    const error = { code: 'EMAIL_CONFLICT', statusCode: 409, message: 'Email settings changed. Reload before saving again.' }
    const { request, emailSettings } = setup({ ok: false, error })
    await expect(writePageStudioEmailConfiguration({ ...request, body: { expectedRevision: 0, settings } })).rejects.toMatchObject(error)
    expect(emailSettings).toHaveBeenCalledOnce()
  })
  it('never retries an uncertain committed write or exposes transport secrets', async () => {
    const { request, emailSettings } = setup()
    emailSettings.mockRejectedValue(new Error('postgresql://private:password@production/db'))
    await expect(writePageStudioEmailConfiguration({ ...request, body: { expectedRevision: 0, settings } })).rejects.toMatchObject(unavailable)
    expect(emailSettings).toHaveBeenCalledOnce()
  })
  it('refuses an absent write body instead of silently reading', async () => {
    const { request, emailSettings } = setup()
    expect(() => writePageStudioEmailConfiguration({ ...request, body: undefined })).toThrow(expect.objectContaining({ code: 'EMAIL_INVALID', statusCode: 400 }))
    expect(emailSettings).not.toHaveBeenCalled()
  })
})
