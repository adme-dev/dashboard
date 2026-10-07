import { describe, expect, it, vi } from 'vitest'
import { operateTrustedFormSettings } from '../../../server/utils/pageStudio/formSettings'
import { operateTrustedFormRecipients } from '../../../server/utils/pageStudio/formRecipients'
import { operateTrustedEmailTemplate, previewTrustedEmailTemplate } from '../../../server/utils/pageStudio/emailTemplates'
import { starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'
import type { TrustedFormContext } from '../../../server/utils/pageStudio/formAuthority'

const scope = { tenantId: 'tenant_one', clientId: 'business_one', businessId: 'business_one', siteId: 'site_one', environment: 'staging' as const }
const identity = { pageId: 'home', formId: 'contact' }
const template = starterEmailTemplate('team')
function setup() {
  const authority = { scope, actorId: 'native_one', authorityKey: JSON.stringify(['customer-user', 'native_one', 'account_one', 'workspace_one']), canEdit: true }
  const authorize = vi.fn().mockResolvedValue(authority)
  const document = { id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId, name: 'Native business' }, studio: { checkpointId: 'checkpoint_one', pages: [{ id: 'home', route: '/', visibility: 'public', forms: [{ id: 'contact', name: 'Contact', fields: [{ id: 'name', name: 'Name', type: 'text' }] }] }], formLibrary: { definitions: [{ id: 'shared_contact', form: { id: 'contact', fields: [{ id: 'name', name: 'Name', type: 'text' }] }, placements: [{ ...identity, fieldIds: { name: 'name' } }] }] } } }
  const readDocument = vi.fn().mockResolvedValue(document)
  const write = async ({ expectedRevision, ...record }: Record<string, unknown>) => ({ ...record, revision: Number(expectedRevision) + 1, updatedAt: '2026-10-02T00:00:00.000Z' })
  const service = { readFormSettingsDraft: vi.fn().mockResolvedValue(null), writeFormSettingsDraft: vi.fn(write), readFormRecipientsDraft: vi.fn().mockResolvedValue(null), writeFormRecipientsDraft: vi.fn(write), readEmailTemplateDraft: vi.fn().mockResolvedValue(null), writeEmailTemplateDraft: vi.fn(write) }
  const resolveMedia = vi.fn().mockResolvedValue({ images: {}, warnings: [] })
  const context = { authorize, readDocument, service, resolveMedia } as TrustedFormContext
  return { context, authority, authorize, readDocument, document, service, resolveMedia }
}
const edit = { checkpointId: 'checkpoint_one', expectedRevision: 0 }
describe('trusted server form operations', () => {
  it('uses the current native identity for all six Worker methods', async () => {
    const s = setup()
    expect(await operateTrustedFormSettings(s.context, identity)).toMatchObject({ record: null })
    expect(await operateTrustedFormSettings(s.context, identity, { ...edit, settings: { fallback: { type: 'message', message: 'Thanks' }, rules: [] } })).toMatchObject({ record: { actorId: 'native_one' } })
    expect(await operateTrustedFormRecipients(s.context)).toMatchObject({ record: null })
    expect(await operateTrustedFormRecipients(s.context, { ...edit, settings: { recipients: ['owner@example.test'], overrides: [] } })).toMatchObject({ record: { actorId: 'native_one' } })
    expect(await operateTrustedEmailTemplate(s.context, 'team')).toMatchObject({ record: null })
    expect(await operateTrustedEmailTemplate(s.context, 'customer', { ...edit, template })).toMatchObject({ record: { actorId: 'native_one', audience: 'customer' } })
  })
  it.each(['id', 'site', 'client'])('rejects document %s substitution before Worker access', async (field) => {
    const s = setup()
    if (field === 'id') s.document.id = 'other'
    if (field === 'site') s.document.site.id = 'other'
    if (field === 'client') s.document.site.clientId = 'other'
    await expect(operateTrustedFormSettings(s.context, identity)).rejects.toThrow()
    expect(s.service.readFormSettingsDraft).not.toHaveBeenCalled()
  })
  it.each(['actorId', 'authorityKey', 'scope'])('rejects same-request %s changes during document work', async (field) => {
    const s = setup()
    s.readDocument.mockImplementation(async () => {
      s.authorize.mockResolvedValue({ ...s.authority, [field]: field === 'scope' ? { ...scope, businessId: 'other' } : 'other' })
      return s.document
    })
    await expect(operateTrustedFormRecipients(s.context)).rejects.toThrow()
    expect(s.service.readFormRecipientsDraft).not.toHaveBeenCalled()
  })
  it.each([undefined, 'shared_contact'])('rechecks after template head RPC before %s writes', async (definitionId) => {
    const s = setup()
    s.service.readEmailTemplateDraft.mockImplementation(async () => {
      s.authorize.mockResolvedValue({ ...s.authority, authorityKey: 'different-account' })
      return null
    })
    await expect(operateTrustedEmailTemplate(s.context, 'team', { ...edit, template }, definitionId)).rejects.toThrow()
    expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })
  it('rechecks after consumed preview image bytes', async () => {
    const s = setup()
    s.resolveMedia.mockImplementation(async () => {
      s.authorize.mockRejectedValue(new Error('revoked during bytes'))
      return { images: {}, warnings: [] }
    })
    await expect(previewTrustedEmailTemplate(s.context, 'team', { ...identity, template })).rejects.toThrow('revoked during bytes')
  })
  it('rejects returned write actor substitution and never retries uncertain writes', async () => {
    const s = setup()
    s.service.writeEmailTemplateDraft.mockImplementation(async ({ expectedRevision, ...record }) => ({ ...record, actorId: 'other', revision: Number(expectedRevision) + 1, updatedAt: '2026-10-02' }))
    await expect(operateTrustedEmailTemplate(s.context, 'team', { ...edit, template })).rejects.toThrow()
    expect(s.service.writeEmailTemplateDraft).toHaveBeenCalledOnce()
  })
})

it.each(['settings-read', 'settings-write', 'recipients-read', 'recipients-write', 'template-read', 'template-write'])('rejects native account changes after %s Worker RPC', async (operation) => {
  const s = setup()
  const settings = { ...edit, settings: { fallback: { type: 'message', message: 'Thanks' }, rules: [] } }
  const recipients = { ...edit, settings: { recipients: [], overrides: [] } }
  const writing = operation.endsWith('write')
  const invoke = operation.startsWith('settings')
    ? () => operateTrustedFormSettings(s.context, identity, writing ? settings : undefined)
    : operation.startsWith('recipients')
      ? () => operateTrustedFormRecipients(s.context, writing ? recipients : undefined)
      : () => operateTrustedEmailTemplate(s.context, 'team', writing ? { ...edit, template } : undefined)
  const method = operation === 'settings-read' ? 'readFormSettingsDraft' : operation === 'settings-write' ? 'writeFormSettingsDraft' : operation === 'recipients-read' ? 'readFormRecipientsDraft' : operation === 'recipients-write' ? 'writeFormRecipientsDraft' : operation === 'template-read' ? 'readEmailTemplateDraft' : 'writeEmailTemplateDraft'
  s.service[method].mockImplementation(async () => {
    s.authorize.mockResolvedValue({ ...s.authority, authorityKey: 'different-account-workspace' })
    return null
  })
  await expect(invoke()).rejects.toThrow()
})
it('requires a bound Worker draft capability and exposes no direct D1 fallback', async () => {
  const s = setup()
  s.context.service = undefined
  await expect(operateTrustedFormRecipients(s.context)).rejects.toMatchObject({ statusCode: 503 })
  s.context.service = { readFormRecipientsDraft: async () => {
    throw new Error('Retained capability denied')
  } }
  await expect(operateTrustedFormRecipients(s.context)).rejects.toMatchObject({ statusCode: 503 })
})
it('returns fresh viewer editability after a read instead of the initial role', async () => {
  const s = setup()
  s.service.readFormRecipientsDraft.mockImplementation(async () => {
    s.authorize.mockResolvedValue({ ...s.authority, canEdit: false })
    return null
  })
  expect(await operateTrustedFormRecipients(s.context)).toMatchObject({ canEdit: false })
})
