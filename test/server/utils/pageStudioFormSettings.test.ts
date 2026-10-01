import { describe, expect, it, vi } from 'vitest'
import { operateFormSettings } from '../../../server/utils/pageStudio/formSettings'
import type { ContentAuthorityRequest } from '../../../server/utils/pageStudio/businessContent'

const scope = { tenantId: 'tenant_one', clientId: 'client_one', businessId: 'client_one', siteId: 'site_one', environment: 'staging' as const }
const identity = { pageId: 'page_home', formId: 'form_contact' }
const body = { checkpointId: 'checkpoint_one', expectedRevision: 0, settings: { fallback: { type: 'message' as const, message: 'Thank you.' }, rules: [] } }
function setup() {
  const authority = { scope, canEdit: true }
  const authorize = vi.fn().mockResolvedValue(authority)
  const document = vi.fn().mockResolvedValue({ studio: { checkpointId: 'checkpoint_one', pages: [
    { id: identity.pageId, route: '/', visibility: 'public', forms: [{ id: identity.formId, fields: [{ id: 'name', type: 'text' }] }] },
    { id: 'page_thanks', route: '/thank-you', visibility: 'hidden', forms: [] }
  ] } })
  const readFormSettingsDraft = vi.fn().mockResolvedValue(null)
  const writeFormSettingsDraft = vi.fn().mockImplementation(async (input) => {
    const { expectedRevision, ...record } = input
    return { ...record, revision: expectedRevision + 1, updatedAt: '2026-10-01T00:00:00.000Z' }
  })
  const service = { readFormSettingsDraft, writeFormSettingsDraft }
  const request = { actor: { role: 'client', actorId: 'user_one', clientId: scope.clientId }, login: {}, siteId: scope.siteId, env: { PAGE_STUDIO_CONTENT_ROUTER: service } } as unknown as ContentAuthorityRequest
  return { authorize, document, service, request, deps: { authorize, document } }
}
describe('standalone form settings', () => {
  it('saves a draft in the scoped customer service and rechecks current authority', async () => {
    const s = setup()
    const result = await operateFormSettings(s.request, identity, body, s.deps)
    expect(result.activation).toBe('draft_only')
    expect(result.record?.revision).toBe(1)
    expect(s.authorize).toHaveBeenCalledTimes(3)
    expect(s.service.writeFormSettingsDraft).toHaveBeenCalledWith({ ...identity, ...body, scope, actorId: 'user_one' })
  })
  it('rejects absent placement, stale checkpoint, unknown rule fields and unavailable destinations before writing', async () => {
    const s = setup()
    for (const [id, edit] of [
      [{ ...identity, formId: 'foreign_form' }, body],
      [identity, { ...body, checkpointId: 'old_checkpoint' }],
      [identity, { ...body, settings: { fallback: { type: 'redirect', path: '/missing' }, rules: [] } }],
      [identity, { ...body, settings: { ...body.settings, rules: [{ fieldId: 'foreign', operator: 'equals', value: 'yes', outcome: body.settings.fallback }] } }]
    ] as const) await expect(operateFormSettings(s.request, id, edit, s.deps)).rejects.toThrow()
    expect(s.service.writeFormSettingsDraft).not.toHaveBeenCalled()
  })
  it('fails closed when permissions are revoked before save or after a remote read', async () => {
    const s = setup()
    s.authorize.mockRejectedValueOnce(new Error('Access denied'))
    await expect(operateFormSettings(s.request, identity, body, s.deps)).rejects.toThrow()
    expect(s.service.writeFormSettingsDraft).not.toHaveBeenCalled()
    s.authorize.mockReset().mockResolvedValueOnce({ scope, canEdit: true }).mockResolvedValueOnce({ scope, canEdit: true }).mockRejectedValueOnce(new Error('Access denied'))
    await expect(operateFormSettings(s.request, identity, undefined, s.deps)).rejects.toThrow()
  })
  it('rejects foreign storage responses and never replays an uncertain write', async () => {
    const s = setup()
    s.service.readFormSettingsDraft.mockResolvedValue({ ...identity, ...body, revision: 1, scope: { ...scope, siteId: 'foreign' }, actorId: 'user_one', updatedAt: '2026-10-01T00:00:00.000Z' })
    await expect(operateFormSettings(s.request, identity, undefined, s.deps)).rejects.toThrow()
    s.service.writeFormSettingsDraft.mockRejectedValue(new Error('network'))
    await expect(operateFormSettings(s.request, identity, body, s.deps)).rejects.toThrow()
    expect(s.service.writeFormSettingsDraft).toHaveBeenCalledTimes(1)
  })
  it('allows a saved same-site destination and returns conflicts distinctly', async () => {
    const s = setup()
    const edit = { ...body, settings: { fallback: { type: 'redirect', path: '/thank-you' }, rules: [] } }
    expect((await operateFormSettings(s.request, identity, edit, s.deps)).record?.settings.fallback.type).toBe('redirect')
    s.service.writeFormSettingsDraft.mockRejectedValue(new Error('Form settings revision conflict'))
    await expect(operateFormSettings(s.request, identity, edit, s.deps)).rejects.toMatchObject({ statusCode: 409 })
  })
})

it('resolves two placements to one shared settings identity and validates canonical fields', async () => {
  const s = setup()
  const doc = await s.document()
  doc.studio.pages[0].forms.push({ id: 'second_form', fields: [{ id: 'legacy_name', type: 'text' }] })
  doc.studio.formLibrary = { schemaVersion: 1, definitions: [{ id: 'shared_contact', revision: 1, form: { id: 'form_contact', name: 'Contact', fields: [{ id: 'name', name: 'Name', type: 'text' }] }, placements: [
    { ...identity, fieldIds: { name: 'name' } }, { pageId: identity.pageId, formId: 'second_form', fieldIds: { name: 'legacy_name' } }
  ] }] }
  const result = await operateFormSettings(s.request, { pageId: identity.pageId, formId: 'second_form' }, body, s.deps)
  expect(result.record).toMatchObject({ definitionId: 'shared_contact' })
  expect(s.service.writeFormSettingsDraft).toHaveBeenCalledWith({ ...body, scope, definitionId: 'shared_contact', actorId: 'user_one' })
  await operateFormSettings(s.request, identity, undefined, s.deps)
  expect(s.service.readFormSettingsDraft).toHaveBeenCalledWith({ scope, definitionId: 'shared_contact' })
  s.service.readFormSettingsDraft.mockResolvedValue({ ...body, ...identity, revision: 1, scope, actorId: 'user_one', updatedAt: '2026-10-01T00:00:00.000Z' })
  await expect(operateFormSettings(s.request, identity, undefined, s.deps)).rejects.toThrow()
})
