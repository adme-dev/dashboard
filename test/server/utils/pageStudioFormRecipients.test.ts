import { describe, expect, it, vi } from 'vitest'
import { FormRecipientSettingsSchema, effectiveFormRecipients } from '../../../shared/pageStudio/formRecipients'
import { operateFormRecipients } from '../../../server/utils/pageStudio/formRecipients'
import type { ContentAuthorityRequest } from '../../../server/utils/pageStudio/businessContent'

const scope = { tenantId: 'tenant_one', clientId: 'client_one', businessId: 'client_one', siteId: 'site_one', environment: 'staging' as const }
const settings = { recipients: ['team@example.test'], overrides: [{ definitionId: 'booking', recipients: ['bookings@example.test'] }] }
const edit = { checkpointId: 'checkpoint_one', expectedRevision: 0, settings }
function setup() {
  const authorize = vi.fn().mockResolvedValue({ scope, canEdit: true })
  const document = vi.fn().mockResolvedValue({ id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId }, studio: { checkpointId: edit.checkpointId, formLibrary: { definitions: [{ id: 'booking' }] } } })
  const service = { readFormRecipientsDraft: vi.fn().mockResolvedValue(null), writeFormRecipientsDraft: vi.fn().mockImplementation(async ({ expectedRevision, ...input }) => ({ ...input, revision: expectedRevision + 1, updatedAt: '2026-10-01T00:00:00.000Z' })) }
  const request = { actor: { role: 'client', actorId: 'user_one', clientId: scope.clientId }, login: {}, siteId: scope.siteId, env: { PAGE_STUDIO_CONTENT_ROUTER: service } } as unknown as ContentAuthorityRequest
  return { authorize, document, service, request, deps: { authorize, document } }
}
describe('customer form recipient drafts', () => {
  it('inherits defaults, preserves explicit overrides and supports explicit no recipients', () => {
    expect(effectiveFormRecipients(settings, 'contact')).toEqual(settings.recipients)
    expect(effectiveFormRecipients(settings, 'booking')).toEqual(['bookings@example.test'])
    expect(effectiveFormRecipients({ ...settings, overrides: [{ definitionId: 'booking', recipients: [] }] }, 'booking')).toEqual([])
  })
  it('rejects header injection, duplicate recipients, duplicate identities and delivery controls', () => {
    for (const invalid of [
      { ...settings, recipients: ['a@example.test\r\nBcc:b@example.test'] },
      { ...settings, recipients: ['TEAM@example.test', 'team@example.test'] },
      { ...settings, overrides: [...settings.overrides, ...settings.overrides] },
      { ...settings, sendingEnabled: true }
    ]) expect(FormRecipientSettingsSchema.safeParse(invalid).success).toBe(false)
  })
  it('writes scoped draft with current authority and rejects foreign definition or stale checkpoint', async () => {
    const s = setup()
    expect(await operateFormRecipients(s.request, edit, s.deps)).toMatchObject({ activation: 'draft_only', record: { settings, revision: 1 } })
    expect(s.authorize).toHaveBeenCalledTimes(3)
    for (const bad of [{ ...edit, checkpointId: 'stale' }, { ...edit, settings: { ...settings, overrides: [{ definitionId: 'foreign', recipients: [] }] } }]) await expect(operateFormRecipients(s.request, bad, s.deps)).rejects.toThrow()
    expect(s.service.writeFormRecipientsDraft).toHaveBeenCalledTimes(1)
  })
  it('denies revoked authority and foreign responses without replaying writes', async () => {
    const s = setup()
    s.authorize.mockRejectedValueOnce(new Error('Denied'))
    await expect(operateFormRecipients(s.request, edit, s.deps)).rejects.toThrow()
    expect(s.service.writeFormRecipientsDraft).not.toHaveBeenCalled()
    s.service.writeFormRecipientsDraft.mockRejectedValueOnce(new Error('Uncertain'))
    await expect(operateFormRecipients(s.request, edit, s.deps)).rejects.toMatchObject({ statusCode: 503 })
    expect(s.service.writeFormRecipientsDraft).toHaveBeenCalledTimes(1)
    s.service.readFormRecipientsDraft.mockResolvedValue({ scope: { ...scope, siteId: 'foreign' }, settings, revision: 1, checkpointId: edit.checkpointId, actorId: 'user_one', updatedAt: '2026-10-01T00:00:00.000Z' })
    await expect(operateFormRecipients(s.request, undefined, s.deps)).rejects.toThrow()
  })
  it('maps conflicts distinctly and rechecks authority after a read', async () => {
    const s = setup()
    s.service.writeFormRecipientsDraft.mockRejectedValue(new Error('Form recipients revision conflict'))
    await expect(operateFormRecipients(s.request, edit, s.deps)).rejects.toMatchObject({ statusCode: 409 })
    s.authorize.mockReset().mockResolvedValueOnce({ scope, canEdit: true }).mockResolvedValueOnce({ scope, canEdit: true }).mockRejectedValueOnce(new Error('Revoked'))
    await expect(operateFormRecipients(s.request, undefined, s.deps)).rejects.toThrow('Revoked')
  })
})
