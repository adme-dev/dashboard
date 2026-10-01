import { describe, expect, it, vi } from 'vitest'
import { emailDesigns, styleEmailTemplate, emailStarterLayout, prepareEmailTemplate } from '../../../shared/pageStudio/emailTemplateDesigns'
import { EmailTemplateSchema, starterEmailTemplate, validateTemplateVariables } from '../../../shared/pageStudio/emailTemplates'
import { renderCustomerEmailPreview } from '../../../server/utils/pageStudio/emailTemplatePreview'
import { operateEmailTemplate } from '../../../server/utils/pageStudio/emailTemplates'
import type { ContentAuthorityRequest } from '../../../server/utils/pageStudio/businessContent'

const scope = { tenantId: 'tenant_one', clientId: 'client_one', businessId: 'client_one', siteId: 'site_one', environment: 'staging' as const }
const template = starterEmailTemplate('team')
const edit = { checkpointId: 'checkpoint_one', expectedRevision: 0, template }
function setup() {
  const authorize = vi.fn().mockResolvedValue({ scope, canEdit: true })
  const document = vi.fn().mockResolvedValue({ site: { name: 'Demo website' }, studio: { checkpointId: edit.checkpointId, pages: [] } })
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
    expect(s.authorize).toHaveBeenCalledTimes(3)
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
