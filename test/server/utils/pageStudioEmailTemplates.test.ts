import { emailRendererEnv } from '../../fixtures/emailRenderer'
import { portalFormContext } from '../../../server/utils/pageStudio/portalFormContext'
import { previewTrustedEmailTemplate, operateEmailTemplate } from '../../../server/utils/pageStudio/emailTemplates'
import { describe, expect, it, vi } from 'vitest'
import { emailDesigns, styleEmailTemplate, emailStarterLayout, prepareEmailTemplate } from '../../../shared/pageStudio/emailTemplateDesigns'
import { emailTemplateRecordFits, EmailTemplateWriteSchema, EmailTemplateSchema, effectiveEmailTemplate, starterEmailTemplate, validateTemplateVariables } from '../../../shared/pageStudio/emailTemplates'
import { renderCustomerEmailPreview } from '../../../workers/email-rendering/src/customerPreview'
import type { ContentAuthorityRequest } from '../../../server/utils/pageStudio/businessContent'

const scope = { tenantId: 'tenant_one', clientId: 'client_one', businessId: 'client_one', siteId: 'site_one', environment: 'staging' as const }
const template = starterEmailTemplate('team')
const edit = { checkpointId: 'checkpoint_one', expectedRevision: 0, template }
function setup() {
  const authorize = vi.fn().mockResolvedValue({ scope, canEdit: true })
  const document = vi.fn().mockResolvedValue({ id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId, name: 'Demo website' }, studio: { checkpointId: edit.checkpointId, pages: [] } })
  const service = { readEmailTemplateDraft: vi.fn().mockResolvedValue(null), writeEmailTemplateDraft: vi.fn().mockImplementation(async ({ expectedRevision, ...input }) => ({ ...input, revision: expectedRevision + 1, updatedAt: '2026-10-01T00:00:00.000Z' })) }
  const request = { actor: { role: 'client', actorId: 'user_one', clientId: scope.clientId }, login: {}, siteId: scope.siteId, env: { PAGE_STUDIO_CONTENT_ROUTER: service } } as unknown as ContentAuthorityRequest
  return { authorize, document, service, request, deps: { authorize, document } }
}
describe('customer email template drafts', () => {
  it('validates the safe document subset and rejects executable styles, unknown variables and delivery fields', () => {
    expect(EmailTemplateSchema.safeParse(template).success).toBe(true)
    expect(validateTemplateVariables({ ...template, subject: '{{recipient.email}}' })).toContain('Unknown variable: recipient.email')
    expect(validateTemplateVariables({ ...template, subject: '{{site.name}' }).length).toBeGreaterThan(0)
    for (const invalid of [
      { ...template, sendingEnabled: true },
      { ...template, blocks: [{ id: 'html', type: 'html', text: '<script>alert(1)</script>' }] },
      { ...template, accentColor: 'red; background:url(https://evil.test)' },
      { ...template, blocks: [{ id: 'link', type: 'button', text: 'Go', url: 'javascript:alert(1)' }] },
      { ...template, subject: 'hello\nBcc:a@example.test' }
    ]) expect(EmailTemplateSchema.safeParse(invalid).success).toBe(false)
  })
  it('reuses the email renderer with escaped answers and an isolated preview', () => {
    const result = renderCustomerEmailPreview(template, { siteName: '</title><script>bad()</script>', formName: '<b>Contact</b>', fields: [{ id: 'name', name: '<img src=x onerror=bad()>', type: 'text' }] })
    expect(result.html).not.toContain('<script>bad()')
    expect(result.html).not.toContain('<img src=x')
    expect(result.html).toContain('&lt;img')
    expect(result.html).toContain('Content-Security-Policy')
    expect(result.html).toContain('Example answer')
    expect(result.subject).toContain('<b>Contact</b>')
    expect(() => renderCustomerEmailPreview({ ...template, subject: '{{unknown}}' }, { siteName: 'Demo', formName: 'Contact', fields: [] })).toThrow()
  })
  it('saves separate scoped audiences with fresh authority and rejects a stale checkpoint', async () => {
    const s = setup()
    expect(await operateEmailTemplate(s.request, 'customer', edit, s.deps)).toMatchObject({ activation: 'draft_only', record: { audience: 'customer', revision: 1 } })
    expect(s.authorize).toHaveBeenCalledTimes(6)
    await expect(operateEmailTemplate(s.request, 'team', { ...edit, checkpointId: 'stale' }, s.deps)).rejects.toMatchObject({ statusCode: 409 })
    expect(s.service.writeEmailTemplateDraft).toHaveBeenCalledTimes(1)
  })
  it('rejects unknown audiences, foreign responses, revoked access and uncertain writes without replay', async () => {
    const s = setup()
    await expect(operateEmailTemplate(s.request, 'foreign', edit, s.deps)).rejects.toThrow()
    s.authorize.mockRejectedValueOnce(new Error('Revoked'))
    await expect(operateEmailTemplate(s.request, 'team', edit, s.deps)).rejects.toThrow('Revoked')
    s.service.writeEmailTemplateDraft.mockRejectedValue(new Error('Uncertain'))
    await expect(operateEmailTemplate(s.request, 'team', edit, s.deps)).rejects.toMatchObject({ statusCode: 503 })
    expect(s.service.writeEmailTemplateDraft).toHaveBeenCalledTimes(1)
    const { expectedRevision: _revision, ...record } = edit
    s.service.readEmailTemplateDraft.mockResolvedValue({ ...record, audience: 'customer', scope, actorId: 'user_one', revision: 1, updatedAt: '2026-10-01T00:00:00.000Z' })
    await expect(operateEmailTemplate(s.request, 'team', undefined, s.deps)).rejects.toThrow()
  })
})

describe('email business identity', () => {
  it('stores bounded contact details while rejecting unsafe links and duplicate social platforms', async () => {
    const identity = { businessName: '{{site.name}}', tagline: 'Travel in comfort', phone: '+61 3 0000 0000', email: 'hello@example.test', address: 'Melbourne\nVictoria', websiteUrl: 'https://example.test', disclaimer: 'Example disclaimer', socials: [{ platform: 'Instagram', url: 'https://instagram.com/example' }] }
    const withIdentity = { ...template, identity }
    expect(EmailTemplateSchema.safeParse(withIdentity).success).toBe(true)
    expect(EmailTemplateSchema.safeParse({ ...withIdentity, identity: { ...identity, websiteUrl: 'javascript:bad()' } }).success).toBe(false)
    expect(EmailTemplateSchema.safeParse({ ...withIdentity, identity: { ...identity, socials: [...identity.socials, ...identity.socials] } }).success).toBe(false)
    const s = setup()
    const saved = await operateEmailTemplate(s.request, 'team', { ...edit, template: withIdentity }, s.deps)
    expect(saved.record?.template.identity).toEqual(identity)
  })
  it('renders header and footer in order, escapes every detail and omits empty contact rows', () => {
    const identity = { businessName: '{{site.name}}', tagline: '<img src=x>', phone: '03 0000 0000', email: 'hello@example.test', address: 'First line\nSecond line', websiteUrl: 'https://example.test', disclaimer: '<script>bad()</script>', socials: [{ platform: 'Instagram' as const, url: 'https://instagram.com/example' }] }
    const preview = renderCustomerEmailPreview({ ...template, identity }, { siteName: 'Demo business', formName: 'Contact', fields: [] })
    expect(preview.html).toContain('&lt;img src=x&gt;')
    expect(preview.html).toContain('&lt;script&gt;bad()&lt;/script&gt;')
    expect(preview.html).toContain('Instagram')
    expect(preview.html).toContain('First line<br>Second line')
    expect(preview.html.indexOf('Travel in comfort')).toBe(-1)
    expect(preview.html.indexOf('&lt;img')).toBeLessThan(preview.html.lastIndexOf('New submission: Contact'))
    expect(preview.html.indexOf('hello@example.test')).toBeGreaterThan(preview.html.lastIndexOf('New submission: Contact'))
    expect(preview.html).not.toContain('href="https://')
  })
})

describe('email starting designs', () => {
  it('keeps message and identity when applying a visual style', () => {
    for (const design of emailDesigns) {
      const styled = styleEmailTemplate(template, design.id)
      expect(styled.blocks).toEqual(template.blocks)
      expect(styled.subject).toBe(template.subject)
      expect(EmailTemplateSchema.safeParse(styled).success).toBe(true)
    }
  })
  it('creates valid audience-specific layouts without confirming a booking', () => {
    for (const audience of ['team', 'customer'] as const) {
      for (const kind of ['enquiry', 'booking'] as const) {
        const layout = emailStarterLayout(audience, kind, template)
        expect(EmailTemplateSchema.safeParse(layout).success).toBe(true)
        expect(layout.identity?.businessName).toBe('{{site.name}}')
        if (audience === 'customer' && kind === 'booking') expect(JSON.stringify(layout.blocks)).toContain('confirmed only when')
      }
    }
  })
})

it('preserves the rendered appearance of a saved legacy template when opening the editor', () => {
  const context = { siteName: 'Demo', formName: 'Contact', fields: [] }
  const edited = prepareEmailTemplate(template, 'team')
  expect(edited.identity?.businessName).toBe('')
  expect(renderCustomerEmailPreview(edited, context).html).toBe(renderCustomerEmailPreview(template, context).html)
  expect(prepareEmailTemplate(null, 'customer').identity?.businessName).toBe('{{site.name}}')
  expect(prepareEmailTemplate(null, 'customer').blocks.some(block => block.id === 'footer')).toBe(false)
})

describe('shared-form template overrides', () => {
  function existing() {
    const s = setup()
    s.document.mockResolvedValue({ id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId, name: 'Demo' }, studio: { checkpointId: edit.checkpointId, pages: [], formLibrary: { definitions: [{ id: 'booking', placements: [{ pageId: 'one', formId: 'a' }, { pageId: 'two', formId: 'b' }] }, { id: 'contact', placements: [] }] } } })
    const record = { scope, audience: 'team' as const, actorId: 'user_one', checkpointId: edit.checkpointId, revision: 2, updatedAt: '2026-10-01T00:00:00.000Z', template, overrides: [{ definitionId: 'contact', template: { ...template, subject: 'Contact only' } }] }
    s.service.readEmailTemplateDraft.mockResolvedValue(record)
    return { ...s, record }
  }
  it('resolves inheritance by definition rather than placement and follows later defaults after reset', () => {
    const s = existing()
    expect(effectiveEmailTemplate(s.record, 'team', 'contact').subject).toBe('Contact only')
    expect(effectiveEmailTemplate({ ...s.record, template: { ...template, subject: 'New default' } }, 'team', 'booking').subject).toBe('New default')
    expect(effectiveEmailTemplate({ ...s.record, overrides: [] }, 'team', 'contact')).toEqual(template)
  })
  it('saves one override for the shared definition and preserves defaults and other forms', async () => {
    const s = existing()
    const result = await operateEmailTemplate(s.request, 'team', { ...edit, expectedRevision: 2, template: { ...template, subject: 'Booking only' } }, s.deps, 'booking')
    expect(result.record?.template).toEqual(template)
    expect(result.record?.overrides).toEqual([...s.record.overrides, { definitionId: 'booking', template: { ...template, subject: 'Booking only' } }])
  })
  it('preserves overrides when changing the website default and rejects injected override arrays', async () => {
    const s = existing()
    const result = await operateEmailTemplate(s.request, 'team', { ...edit, expectedRevision: 2 }, s.deps)
    expect(result.record?.overrides).toEqual(s.record.overrides)
    await expect(operateEmailTemplate(s.request, 'team', { ...edit, overrides: [] }, s.deps)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('reset removes only the selected override, so future website edits remain inherited', async () => {
    const s = existing()
    const result = await operateEmailTemplate(s.request, 'team', { ...edit, expectedRevision: 2, template: null }, s.deps, 'contact')
    expect(result.record?.overrides).toEqual([])
    expect(result.record?.template).toEqual(template)
    await expect(operateEmailTemplate(s.request, 'team', { ...edit, template: null }, s.deps)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects removed or foreign forms, stale saves and mismatched stored scopes before writing', async () => {
    const s = existing()
    await expect(operateEmailTemplate(s.request, 'team', undefined, s.deps, 'foreign')).rejects.toMatchObject({ statusCode: 404 })
    await expect(operateEmailTemplate(s.request, 'team', edit, s.deps, 'booking')).rejects.toMatchObject({ statusCode: 409 })
    s.service.readEmailTemplateDraft.mockResolvedValue({ ...s.record, scope: { ...scope, siteId: 'foreign' } })
    await expect(operateEmailTemplate(s.request, 'team', { ...edit, expectedRevision: 2 }, s.deps, 'booking')).rejects.toMatchObject({ statusCode: 503 })
    expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })
  it('rejects a worker acknowledgement that silently drops overrides', async () => {
    const s = existing()
    s.service.writeEmailTemplateDraft.mockImplementation(async ({ expectedRevision, overrides: _overrides, ...input }) => ({ ...input, revision: expectedRevision + 1, updatedAt: s.record.updatedAt }))
    await expect(operateEmailTemplate(s.request, 'team', { ...edit, expectedRevision: 2 }, s.deps, 'booking')).rejects.toMatchObject({ statusCode: 503 })
    expect(s.service.writeEmailTemplateDraft).toHaveBeenCalledTimes(1)
  })
  it('lists only overrides for deleted definitions, retaining unused shared forms', async () => {
    const s = existing()
    s.record.overrides.push({ definitionId: 'removed', template })
    const result = await operateEmailTemplate(s.request, 'team', undefined, s.deps)
    expect(result.removedDefinitionIds).toEqual(['removed'])
    expect(result.record?.overrides).toEqual(s.record.overrides)
    expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })
  it('removes only explicitly selected obsolete overrides while preserving defaults and other templates', async () => {
    const s = existing()
    s.record.overrides.push({ definitionId: 'removed', template }, { definitionId: 'keep_removed', template })
    const result = await operateEmailTemplate(s.request, 'team', { ...edit, expectedRevision: 2, removeOverrideDefinitionIds: ['removed'] }, s.deps)
    expect(result.record?.revision).toBe(3)
    expect(result.record?.template).toEqual(template)
    expect(result.record?.overrides?.map(item => item.definitionId)).toEqual(['contact', 'keep_removed'])
    expect(result.removedDefinitionIds).toEqual(['keep_removed'])
    expect(s.service.writeEmailTemplateDraft.mock.calls[0]![0]).not.toHaveProperty('removeOverrideDefinitionIds')
  })
  it.each([['contact'], ['unknown'], ['removed', 'removed']])('rejects unsafe cleanup selection %j without writing', async (...ids) => {
    const s = existing()
    s.record.overrides.push({ definitionId: 'removed', template })
    await expect(operateEmailTemplate(s.request, 'team', { ...edit, expectedRevision: 2, removeOverrideDefinitionIds: ids }, s.deps)).rejects.toMatchObject({ statusCode: 400 })
    expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })
  it('keeps cleanup website-only and enforces stale revisions and checkpoint conflicts', async () => {
    const s = existing()
    s.record.overrides.push({ definitionId: 'removed', template })
    const cleanup = { ...edit, expectedRevision: 2, removeOverrideDefinitionIds: ['removed'] }
    await expect(operateEmailTemplate(s.request, 'team', cleanup, s.deps, 'contact')).rejects.toMatchObject({ statusCode: 400 })
    await expect(operateEmailTemplate(s.request, 'team', { ...cleanup, expectedRevision: 1 }, s.deps)).rejects.toMatchObject({ statusCode: 409 })
    await expect(operateEmailTemplate(s.request, 'team', { ...cleanup, checkpointId: 'stale' }, s.deps)).rejects.toMatchObject({ statusCode: 409 })
    expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })
  it('cleans obsolete overrides without resolving unchanged default images, but validates changed defaults', async () => {
    const s = existing()
    s.record.overrides.push({ definitionId: 'removed', template })
    const media = vi.fn().mockResolvedValue({ images: {}, warnings: ['The saved image was removed'] })
    const cleanup = { ...edit, expectedRevision: 2, removeOverrideDefinitionIds: ['removed'] }
    const result = await operateEmailTemplate(s.request, 'team', cleanup, { ...s.deps, media })
    expect(result.record?.template).toEqual(s.record.template)
    expect(media).not.toHaveBeenCalled()
    await expect(operateEmailTemplate(s.request, 'team', { ...cleanup, template: { ...template, subject: 'Changed' } }, { ...s.deps, media })).rejects.toMatchObject({ statusCode: 400 })
    expect(media).toHaveBeenCalledOnce()
    expect(s.service.writeEmailTemplateDraft).toHaveBeenCalledOnce()
  })
})

it('shows and persists the same initial website design when the first save is a form override', async () => {
  const s = setup()
  s.document.mockResolvedValue({ id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId }, studio: { checkpointId: edit.checkpointId, formLibrary: { definitions: [{ id: 'booking' }] } } })
  const initial = prepareEmailTemplate(null, 'team')
  const inherited = effectiveEmailTemplate(null, 'team', 'booking')
  expect(inherited).toEqual(initial)
  const result = await operateEmailTemplate(s.request, 'team', edit, s.deps, 'booking')
  expect(result.record?.template).toEqual(initial)
})

it('bounds aggregate UTF-8 records before dispatching a customer-storage write', async () => {
  expect(emailTemplateRecordFits('a'.repeat(1_499_998))).toBe(true)
  expect(emailTemplateRecordFits('a'.repeat(1_499_999))).toBe(false)
  expect(emailTemplateRecordFits('界'.repeat(500_000))).toBe(false)
  const large = { ...template, blocks: Array.from({ length: 30 }, (_, index) => ({ id: `text_${index}`, type: 'text' as const, text: 'a'.repeat(8000) })) }
  const overrides = Array.from({ length: 5 }, (_, index) => ({ definitionId: `form_${index}`, template: large }))
  const s = setup()
  s.document.mockResolvedValue({ id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId }, studio: { checkpointId: edit.checkpointId, formLibrary: { definitions: [{ id: 'booking' }] } } })
  s.service.readEmailTemplateDraft.mockResolvedValue({ scope, audience: 'team', actorId: 'user_one', checkpointId: edit.checkpointId, revision: 1, updatedAt: '2026-10-01T00:00:00.000Z', template: large, overrides })
  expect(EmailTemplateWriteSchema.safeParse({ ...edit, actorId: 'user_one', scope, audience: 'team', template: large, overrides: [...overrides, { definitionId: 'booking', template: large }] }).success).toBe(false)
  await expect(operateEmailTemplate(s.request, 'team', { ...edit, expectedRevision: 1, template: large }, s.deps, 'booking')).rejects.toMatchObject({ statusCode: 400 })
  expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
})

it('rejects unavailable image references before writing and rechecks permission after media reads', async () => {
  const s = setup()
  const withImage = { ...template, blocks: [{ id: 'photo', type: 'image', assetId: '10000000-0000-4000-8000-000000000001', alt: 'Photo', width: 500, alignment: 'center' }] }
  const media = vi.fn().mockResolvedValue({ images: {}, warnings: ['Choose a current website image'] })
  await expect(operateEmailTemplate(s.request, 'team', { ...edit, template: withImage }, { ...s.deps, media })).rejects.toMatchObject({ statusCode: 400 })
  expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
  media.mockImplementation(async () => {
    s.authorize.mockRejectedValueOnce(new Error('Permission revoked during media read'))
    return { images: {}, warnings: [] }
  })
  await expect(operateEmailTemplate(s.request, 'team', { ...edit, template: withImage }, { ...s.deps, media })).rejects.toThrow('Permission revoked during media read')
  expect(s.service.writeEmailTemplateDraft).not.toHaveBeenCalled()
})

it('allows reset without reading stale images in the inherited template', async () => {
  const s = setup()
  s.document.mockResolvedValue({ id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId }, studio: { checkpointId: edit.checkpointId, formLibrary: { definitions: [{ id: 'booking' }] } } })
  const media = vi.fn().mockRejectedValue(new Error('Must not read inherited images during reset'))
  await operateEmailTemplate(s.request, 'team', { ...edit, template: null }, { ...s.deps, media }, 'booking')
  expect(media).not.toHaveBeenCalled()
  expect(s.service.writeEmailTemplateDraft).toHaveBeenCalledOnce()
})

it('binds portal rendering to the server environment and rechecks client scope afterwards', async () => {
  const s = setup()
  s.document.mockResolvedValue({ id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId, name: 'Demo' }, studio: { checkpointId: edit.checkpointId, pages: [{ id: 'home', route: '/', forms: [{ id: 'contact', name: 'Contact', fields: [{ id: 'name', name: 'Name', type: 'text', required: true }] }] }] } } as never)
  const render = vi.fn(async (request: unknown) => {
    const result = await emailRendererEnv.EMAIL_RENDERER.render(request)
    expect(result.ok).toBe(true)
    s.authorize.mockResolvedValue({ scope: { ...scope, clientId: 'other' }, canEdit: true })
    return result
  })
  s.request.env = { ...emailRendererEnv, EMAIL_RENDERER: { render } }
  const context = portalFormContext(s.request, { ...s.deps, media: vi.fn().mockResolvedValue({ images: {}, warnings: [] }) })
  await expect(previewTrustedEmailTemplate(context, 'team', { pageId: 'home', formId: 'contact', template })).rejects.toMatchObject({ statusCode: 403 })
  expect(render).toHaveBeenCalledOnce()
})
