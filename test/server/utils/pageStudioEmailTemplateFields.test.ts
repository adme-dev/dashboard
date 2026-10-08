import { describe, expect, it, vi } from 'vitest'
import { operateTrustedEmailTemplate, previewTrustedEmailTemplate } from '../../../server/utils/pageStudio/emailTemplates'
import { starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'
import type { TrustedFormContext } from '../../../server/utils/pageStudio/formAuthority'
import { renderCustomerEmailPreview } from '../../../workers/email-rendering/src/customerPreview'

const scope = { tenantId: 'tenant_one', clientId: 'client_one', businessId: 'client_one', siteId: 'site_one', environment: 'staging' as const }
const template = { ...starterEmailTemplate('customer'), schemaVersion: 2 as const, subject: 'Hello {{field.booking.canonical_name}}', fieldBindings: [{ formKey: 'booking', fieldId: 'canonical_name', type: 'text' as const, fallback: 'there' }] }
function fixture() {
  const fields = [{ id: 'canonical_name', name: 'Name', type: 'text' }]
  const doc = { id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId, name: 'Demo' }, studio: { checkpointId: 'checkpoint_one', pages: [{ id: 'home', title: 'Home', route: '/', forms: [{ id: 'legacy_booking', name: 'Booking', fields: [{ ...fields[0], id: 'legacy_name' }] }] }], formLibrary: { schemaVersion: 1, definitions: [{ id: 'booking', revision: 1, form: { id: 'canonical_booking', name: 'Booking', fields }, placements: [{ pageId: 'home', formId: 'legacy_booking', fieldIds: { legacy_name: 'canonical_name' } }] }] } } }
  let saved: unknown = null
  const service = { readEmailTemplateDraft: vi.fn(async () => saved), writeEmailTemplateDraft: vi.fn(async ({ expectedRevision, ...input }) => {
    saved = { ...input, revision: expectedRevision + 1, updatedAt: '2026-10-09T00:00:00.000Z' }
    return saved
  }) }
  const context = { authorize: vi.fn(async () => ({ scope, actorId: 'writer', authorityKey: 'current-login', canEdit: true })), readDocument: vi.fn(async () => structuredClone(doc)), resolveMedia: vi.fn(async () => ({ images: {}, warnings: [] })), renderEmailPreview: vi.fn(renderCustomerEmailPreview), service } as unknown as TrustedFormContext
  const edit = { checkpointId: 'checkpoint_one', expectedRevision: 0, template }
  return { context, doc, fields, service, edit }
}
describe('current owned schema for email field references', () => {
  it('saves and previews canonical shared fields instead of obsolete placement field IDs', async () => {
    const f = fixture()
    const saved = await operateTrustedEmailTemplate(f.context, 'customer', f.edit, 'booking')
    expect(saved.record?.overrides?.[0]?.template).toMatchObject(template)
    const preview = await previewTrustedEmailTemplate(f.context, 'customer', { template, pageId: 'home', formId: 'legacy_booking' })
    expect(preview.subject).toBe('Hello Example answer')
    expect(f.context.renderEmailPreview).toHaveBeenCalledWith(template, expect.objectContaining({ formKey: 'booking', fields: f.fields }))
  })
  it('keeps the V1 preview wire context unchanged', async () => {
    const f = fixture()
    const legacy = starterEmailTemplate('customer')
    await previewTrustedEmailTemplate(f.context, 'customer', { template: legacy, pageId: 'home', formId: 'legacy_booking' })
    expect(f.context.renderEmailPreview).toHaveBeenCalledWith(legacy, { siteName: 'Demo', formName: 'Booking', fields: f.fields, images: {} })
  })
  it('preserves an unrelated stale override as a readable draft while saving a valid default', async () => {
    const f = fixture()
    const old = { ...template, subject: '{{field.removed.name}}', fieldBindings: [{ ...template.fieldBindings[0], formKey: 'removed', fieldId: 'name' }] }
    const head = { scope, audience: 'customer', checkpointId: 'checkpoint_one', actorId: 'writer', revision: 1, updatedAt: '2026-10-09T00:00:00.000Z', template: starterEmailTemplate('customer'), overrides: [{ definitionId: 'removed', template: old }] }
    f.service.readEmailTemplateDraft.mockResolvedValueOnce(head)
    const saved = await operateTrustedEmailTemplate(f.context, 'customer', { ...f.edit, expectedRevision: 1, template: starterEmailTemplate('customer') })
    expect(saved.record?.overrides).toEqual(head.overrides)
    expect(saved.removedDefinitionIds).toEqual(['removed'])
    expect((await operateTrustedEmailTemplate(f.context, 'customer')).record?.overrides).toEqual(head.overrides)
    await expect(previewTrustedEmailTemplate(f.context, 'customer', { template: old, pageId: 'home', formId: 'legacy_booking' })).rejects.toMatchObject({ statusCode: 400 })
    const cleaned = await operateTrustedEmailTemplate(f.context, 'customer', { ...f.edit, expectedRevision: 2, template: starterEmailTemplate('customer'), removeOverrideDefinitionIds: ['removed'] })
    expect(cleaned.record?.overrides).toEqual([])
  })
  it('rejects stale and foreign references before write and retains stable renamed labels', async () => {
    const f = fixture()
    f.fields[0].name = 'Preferred name'
    await operateTrustedEmailTemplate(f.context, 'customer', f.edit, 'booking')
    for (const binding of [{ ...template.fieldBindings[0], formKey: 'home:legacy_booking', fieldId: 'legacy_name' }, { ...template.fieldBindings[0], formKey: 'foreign' }, { ...template.fieldBindings[0], type: 'email' }]) {
      const bad = { ...f.edit, expectedRevision: 1, template: { ...template, fieldBindings: [binding] } }
      await expect(operateTrustedEmailTemplate(f.context, 'customer', bad, 'booking')).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(f.service.writeEmailTemplateDraft).toHaveBeenCalledTimes(1)
  })
  it('withholds preview when schema changes during rendering', async () => {
    const f = fixture()
    vi.mocked(f.context.renderEmailPreview).mockImplementation(async (...args) => {
      const result = renderCustomerEmailPreview(...args)
      f.fields.splice(0)
      return result
    })
    await expect(previewTrustedEmailTemplate(f.context, 'customer', { template, pageId: 'home', formId: 'legacy_booking' })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('withholds writes when schema changes during media resolution', async () => {
    const f = fixture()
    vi.mocked(f.context.resolveMedia).mockImplementation(async () => {
      f.fields[0].type = 'hidden'
      return { images: {}, warnings: [] }
    })
    await expect(operateTrustedEmailTemplate(f.context, 'customer', f.edit)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })
  it('reports a raced accepted draft without replay and permits explicit field-reference repair', async () => {
    const f = fixture()
    const write = f.service.writeEmailTemplateDraft.getMockImplementation()!
    f.service.writeEmailTemplateDraft.mockImplementation(async (input) => {
      const result = await write(input)
      f.fields.splice(0)
      return result
    })
    await expect(operateTrustedEmailTemplate(f.context, 'customer', f.edit)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.service.writeEmailTemplateDraft).toHaveBeenCalledTimes(1)
    const current = await operateTrustedEmailTemplate(f.context, 'customer')
    expect(current.record?.revision).toBe(1)
    expect(current.record?.template.fieldBindings).toEqual(template.fieldBindings)
    const repaired = { ...f.edit, expectedRevision: 1, template: { ...template, subject: 'Thank you', fieldBindings: [] } }
    expect((await operateTrustedEmailTemplate(f.context, 'customer', repaired)).record?.revision).toBe(2)
  })
})
