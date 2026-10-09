import { describe, expect, it, vi } from 'vitest'
import { readEmailTemplateFieldOptions } from '../../../server/utils/pageStudio/emailTemplateFieldSupport'
import type { TrustedFormContext } from '../../../server/utils/pageStudio/formAuthority'
import { renderCustomerEmailPreview } from '../../../workers/email-rendering/src/customerPreview'

const scope = { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId: 'site', environment: 'staging' as const }
function setup() {
  const authority = { scope, actorId: 'reader', authorityKey: 'current', canEdit: true }
  const doc = { id: 'site', site: { id: 'site', clientId: 'client', name: 'Private business' }, studio: { checkpointId: 'checkpoint_one', pages: [{ id: 'home', forms: [{ id: 'contact', name: 'Contact', fields: [{ id: 'name', name: 'Preferred name', type: 'text', defaultValue: 'SECRET DEFAULT' }, { id: 'hidden', name: 'Secret', type: 'hidden' }] }] }] } }
  const service = { readEmailTemplateDraft: vi.fn(async () => ({ scope, contractVersion: 2 })), writeEmailTemplateDraft: vi.fn() }
  const context = { authorize: vi.fn(async () => structuredClone(authority)), readDocument: vi.fn(async () => structuredClone(doc)), service, renderEmailPreview: vi.fn(async (...args: Parameters<typeof renderCustomerEmailPreview>) => renderCustomerEmailPreview(...args)), resolveMedia: vi.fn() } as unknown as TrustedFormContext
  const read = () => readEmailTemplateFieldOptions(context, 'customer', { pageId: 'home', formId: 'contact' })
  return { context, doc, service, read }
}
describe('verified current email field options', () => {
  it('snapshots only trusted authority values when the real adapter includes service methods', async () => {
    const s = setup()
    const authority = await s.context.authorize(false)
    vi.mocked(s.context.authorize).mockResolvedValue({ ...authority, service: { read: () => null } } as typeof authority)
    expect(await s.read()).toMatchObject({ available: true })
  })
  it('requires matching scoped storage and renderer support, returning only visible schema', async () => {
    const s = setup()
    expect(await s.read()).toEqual({ available: true, siteId: 'site', apiAudience: 'portal', checkpointId: 'checkpoint_one', formKey: 'home:contact', fields: [{ fieldId: 'name', label: 'Preferred name', type: 'text' }] })
    expect(s.service.readEmailTemplateDraft).toHaveBeenCalledWith({ scope, audience: 'customer', contractVersion: 2 })
    expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(s.context.renderEmailPreview).mock.calls)).not.toContain('SECRET DEFAULT')
    expect(JSON.stringify(vi.mocked(s.context.renderEmailPreview).mock.calls)).not.toContain('Private business')
  })
  it.each(['old-storage', 'foreign-receipt', 'old-renderer'])('withholds field controls for %s', async (failure) => {
    const s = setup()
    if (failure === 'old-storage') s.service.readEmailTemplateDraft.mockRejectedValue(new Error('Unknown request property'))
    if (failure === 'foreign-receipt') s.service.readEmailTemplateDraft.mockResolvedValue({ scope: { ...scope, siteId: 'foreign' }, contractVersion: 2 })
    if (failure === 'old-renderer') vi.mocked(s.context.renderEmailPreview).mockRejectedValue(new Error('Unsupported template'))
    expect(await s.read()).toMatchObject({ available: false })
    expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })
  it('rechecks current read authority after an unavailable or successful provider reply', async () => {
    const s = setup()
    s.service.readEmailTemplateDraft.mockImplementation(async () => {
      vi.mocked(s.context.authorize).mockRejectedValue(Object.assign(new Error('Revoked'), { statusCode: 403 }))
      throw new Error('Unknown version')
    })
    await expect(s.read()).rejects.toMatchObject({ statusCode: 403 })
  })
  it('returns the current checkpoint after a schema change during compatibility probing', async () => {
    const s = setup()
    s.service.readEmailTemplateDraft.mockImplementation(async () => {
      s.doc.studio.checkpointId = 'checkpoint_two'
      return { scope, contractVersion: 2 }
    })
    expect(await s.read()).toMatchObject({ available: true, checkpointId: 'checkpoint_two' })
  })
  it('rejects foreign selection, override mismatches and caller-owned authority', async () => {
    const s = setup()
    await expect(readEmailTemplateFieldOptions(s.context, 'customer', { pageId: 'foreign', formId: 'contact' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(readEmailTemplateFieldOptions(s.context, 'customer', { pageId: 'home', formId: 'contact' }, 'other')).rejects.toMatchObject({ statusCode: 404 })
    await expect(readEmailTemplateFieldOptions(s.context, 'customer', { pageId: 'home', formId: 'contact', scope })).rejects.toMatchObject({ statusCode: 400 })
  })
})
