import { describe, expect, it, vi } from 'vitest'
import { listTrustedEmailTemplateHistory, readTrustedEmailTemplateRevision } from '../../../server/utils/pageStudio/emailTemplates'
import { EmailTemplateHistoryQuerySchema, EmailTemplateRevisionParamSchema, starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'
import type { TrustedFormContext } from '../../../server/utils/pageStudio/formAuthority'

const scope = { tenantId: 'tenant_one', clientId: 'business_one', businessId: 'business_one', siteId: 'site_one', environment: 'staging' as const }
const template = starterEmailTemplate('team')
const updatedAt = '2026-10-02T00:00:00.000Z'
function setup() {
  const authority = { scope, actorId: 'native_one', authorityKey: 'native-account-workspace', canEdit: true }
  const authorize = vi.fn().mockResolvedValue(authority)
  const document = { id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId }, studio: { checkpointId: 'checkpoint_one', pages: [], formLibrary: { definitions: [{ id: 'contact' }, { id: 'booking' }] } } }
  const readDocument = vi.fn().mockResolvedValue(document)
  const record = { scope, audience: 'team', actorId: 'private_actor', checkpointId: 'old_checkpoint', revision: 2, updatedAt, template, overrides: [{ definitionId: 'contact', template: { ...template, subject: 'Contact only' } }, { definitionId: 'removed', template }] }
  const page = { scope, audience: 'team', revisions: [{ revision: 2, updatedAt }], nextBeforeRevision: null }
  const service = { listEmailTemplateDraftHistory: vi.fn().mockResolvedValue(page), readEmailTemplateDraft: vi.fn().mockResolvedValue(record) }
  const context = { authorize, readDocument, service, resolveMedia: vi.fn() } as TrustedFormContext
  return { context, authority, authorize, document, readDocument, service, record, page }
}
describe('trusted customer template history', () => {
  it('projects metadata and only the selected template, preserving inheritance as null', async () => {
    const s = setup()
    expect(await listTrustedEmailTemplateHistory(s.context, 'team', { beforeRevision: 3 }, 'contact')).toEqual({ audience: 'team', canEdit: true, revisions: s.page.revisions, nextBeforeRevision: null })
    expect(await readTrustedEmailTemplateRevision(s.context, 'team', 2)).toEqual({ revision: 2, updatedAt, template })
    expect(await readTrustedEmailTemplateRevision(s.context, 'team', 2, 'contact')).toEqual({ revision: 2, updatedAt, template: s.record.overrides[0]!.template })
    expect(await readTrustedEmailTemplateRevision(s.context, 'team', 2, 'booking')).toEqual({ revision: 2, updatedAt, template: null })
    expect(s.service.readEmailTemplateDraft).toHaveBeenCalledWith({ scope, audience: 'team', revision: 2 })
  })
  it('returns current viewer permissions and withholds revoked access after document or RPC awaits', async () => {
    const s = setup()
    s.service.listEmailTemplateDraftHistory.mockImplementation(async () => {
      s.authorize.mockResolvedValue({ ...s.authority, canEdit: false })
      return s.page
    })
    expect(await listTrustedEmailTemplateHistory(s.context, 'team')).toMatchObject({ canEdit: false })
    expect(s.authorize.mock.calls.every(([writing]) => writing === false)).toBe(true)
    for (const operation of ['list', 'detail'] as const) {
      for (const boundary of ['document', 'rpc'] as const) {
        const t = setup()
        const method = boundary === 'document' ? t.readDocument : operation === 'list' ? t.service.listEmailTemplateDraftHistory : t.service.readEmailTemplateDraft
        method.mockImplementation(async () => {
          t.authorize.mockResolvedValue({ ...t.authority, authorityKey: 'revoked-account' })
          return boundary === 'document' ? t.document : operation === 'list' ? t.page : t.record
        })
        await expect(operation === 'list' ? listTrustedEmailTemplateHistory(t.context, 'team') : readTrustedEmailTemplateRevision(t.context, 'team', 2)).rejects.toMatchObject({ statusCode: 403 })
      }
    }
  })
  it('returns safe 404 for absent revision or removed/unknown selected definitions', async () => {
    const s = setup()
    await expect(listTrustedEmailTemplateHistory(s.context, 'team', {}, 'removed')).rejects.toMatchObject({ statusCode: 404 })
    await expect(readTrustedEmailTemplateRevision(s.context, 'team', 2, 'removed')).rejects.toMatchObject({ statusCode: 404 })
    expect(s.service.readEmailTemplateDraft).not.toHaveBeenCalled()
    s.service.readEmailTemplateDraft.mockResolvedValue(null)
    await expect(readTrustedEmailTemplateRevision(s.context, 'team', 99)).rejects.toMatchObject({ statusCode: 404 })
  })
  it('fails closed on foreign or corrupted responses, cursor mismatch and stale-runtime latest substitution', async () => {
    for (const bad of [{ scope: { ...scope, siteId: 'foreign' } }, { audience: 'customer' }, { revision: 3 }, { updatedAt: 'bad' }, { actorId: undefined }]) {
      const s = setup()
      s.service.readEmailTemplateDraft.mockResolvedValue({ ...s.record, ...bad })
      await expect(readTrustedEmailTemplateRevision(s.context, 'team', 2)).rejects.toMatchObject({ statusCode: 503 })
    }
    for (const bad of [{ scope: { ...scope, businessId: 'foreign' } }, { audience: 'customer' }, { nextBeforeRevision: 2 }, { revisions: [{ revision: 1, updatedAt }, { revision: 2, updatedAt }] }, { revisions: [{ revision: 2, updatedAt, actorId: 'private' }] }]) {
      const s = setup()
      s.service.listEmailTemplateDraftHistory.mockResolvedValue({ ...s.page, ...bad })
      await expect(listTrustedEmailTemplateHistory(s.context, 'team')).rejects.toMatchObject({ statusCode: 503 })
    }
    const s = setup()
    await expect(listTrustedEmailTemplateHistory(s.context, 'team', { beforeRevision: 2 })).rejects.toMatchObject({ statusCode: 503 })
    Reflect.deleteProperty(s.service, 'listEmailTemplateDraftHistory')
    await expect(listTrustedEmailTemplateHistory(s.context, 'team')).rejects.toMatchObject({ statusCode: 503, code: 'EMAIL_TEMPLATE_HISTORY_UNAVAILABLE' })
    s.service.readEmailTemplateDraft.mockRejectedValue(new Error('Old deployed runtime'))
    await expect(readTrustedEmailTemplateRevision(s.context, 'team', 2)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('rejects malformed/injected query and revision values before authority or RPC work', async () => {
    for (const value of ['0', '-1', '1.5', '1e3', '01', '', ' 1', '1 OR 1=1', '9007199254740992', ['1'], { revision: '1' }]) {
      expect(EmailTemplateRevisionParamSchema.safeParse(value).success).toBe(false)
      expect(EmailTemplateHistoryQuerySchema.safeParse({ beforeRevision: value }).success).toBe(false)
    }
    expect(EmailTemplateRevisionParamSchema.parse('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER)
    expect(EmailTemplateHistoryQuerySchema.safeParse({ actorId: 'injected' }).success).toBe(false)
    const s = setup()
    await expect(listTrustedEmailTemplateHistory(s.context, 'team', { limit: 500 })).rejects.toMatchObject({ statusCode: 400 })
    await expect(readTrustedEmailTemplateRevision(s.context, 'team', 0)).rejects.toMatchObject({ statusCode: 400 })
    expect(s.authorize).not.toHaveBeenCalled()
  })
})
