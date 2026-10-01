import { describe, expect, it, vi } from 'vitest'
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
