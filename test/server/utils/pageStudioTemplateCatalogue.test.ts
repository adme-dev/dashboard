import { resolvePortalTemplateTenant, resolveAgencyTemplateTenant } from '~~/server/utils/pageStudio/templateCatalogueAuthority'
import { describe, expect, it, vi } from 'vitest'
import { PageStudioTemplateCardSchema, PageStudioTemplateListQuery } from '~~/shared/pageStudio/templateCatalogue'
import { listPermittedTemplates } from '~~/server/utils/pageStudio/templateCatalogue'

const id = '10000000-0000-4000-8000-000000000001'
const actor = { kind: 'agency' as const, userId: id, tenantId: 'agency', sessionIdentity: 'a'.repeat(64) }
const row = { id, name: 'Kia', versionId: id, format: 'code-pages', privateKey: 'secret' }
describe('template catalogue', () => {
  it('projects only bounded public fields and keeps unsupported actions unavailable', async () => {
    const result = await listPermittedTemplates(actor, {}, { query: vi.fn().mockResolvedValue([row]), reauthorize: vi.fn().mockResolvedValue(actor) })
    expect(result).toEqual({ items: [{ id, name: 'Kia', versionId: id, category: 'automotive', format: 'code-pages', status: 'preparing', thumbnail: null, canPreview: false, canUse: false, unavailableReason: 'Preview and independent editing are being prepared.' }], nextCursor: null })
    expect(JSON.stringify(result)).not.toContain('secret')
  })
  it('rechecks identity after storage and refuses scope changes', async () => {
    await expect(listPermittedTemplates(actor, {}, { query: vi.fn().mockResolvedValue([row]), reauthorize: vi.fn().mockResolvedValue({ ...actor, tenantId: 'other' }) })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not return a version removed during reauthorization', async () => {
    const query = vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([])
    expect(await listPermittedTemplates(actor, {}, { query, reauthorize: vi.fn().mockResolvedValue(actor) })).toEqual({ items: [], nextCursor: null })
  })
  it('uses a bounded keyset and never trusts supplied scopes', async () => {
    expect(PageStudioTemplateListQuery.safeParse({ tenantId: 'other' }).success).toBe(false)
    expect(PageStudioTemplateListQuery.safeParse({ limit: 51 }).success).toBe(false)
    expect(PageStudioTemplateListQuery.safeParse({ cursor: 'bad' }).success).toBe(false)
    const second = { ...row, versionId: '10000000-0000-4000-8000-000000000002' }
    const result = await listPermittedTemplates(actor, { limit: 1 }, { query: vi.fn().mockResolvedValue([row, second]), reauthorize: vi.fn().mockResolvedValue(actor) })
    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).toBe(id)
  })
  it('cannot advertise ready actions or private fields through the card schema', () => {
    const card = { ...row, category: 'automotive', status: 'preparing', thumbnail: null, canPreview: false, canUse: false, unavailableReason: 'Preparing' }
    expect(PageStudioTemplateCardSchema.safeParse(card).success).toBe(false)
    const { privateKey: _, ...safe } = card
    expect(PageStudioTemplateCardSchema.safeParse(safe).success).toBe(true)
    expect(PageStudioTemplateCardSchema.safeParse({ ...safe, canUse: true }).success).toBe(false)
  })
  it('rejects missing and ambiguous read entitlement tenants', async () => {
    for (const rows of [[], [{ tenant_id: 'a' }, { tenant_id: 'b' }]]) await expect(resolvePortalTemplateTenant(id, vi.fn().mockResolvedValue(rows))).rejects.toThrow('Template access')
    expect(await resolvePortalTemplateTenant(id, vi.fn().mockResolvedValue([{ tenant_id: 'a' }]))).toBe('a')
  })

  it('uses only server org metadata or the complete trusted staging scope', async () => {
    const query = vi.fn().mockResolvedValue([{ tenant_id: 'server-owner' }])
    expect(await resolveAgencyTemplateTenant({}, query)).toBe('server-owner')
    expect(await resolveAgencyTemplateTenant({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_STAGING_TENANT_ID: 'forged' }, query)).toBe('server-owner')
    expect(await resolveAgencyTemplateTenant({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_STAGING_TENANT_ID: 'isolated' }, query)).toBe('isolated')
    await expect(resolveAgencyTemplateTenant({}, vi.fn().mockResolvedValue([]))).rejects.toMatchObject({ statusCode: 403 })
  })
})
