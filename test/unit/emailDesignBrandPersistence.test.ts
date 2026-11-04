/* eslint @typescript-eslint/no-explicit-any: off -- Heterogeneous transactional SQL fixture. */
import { describe, expect, it, vi } from 'vitest'
import { executeDesignBrand, readDesignBrandOptions } from '../../server/utils/email-marketing/designBrand'
import { designDigest } from '../../shared/emailRendering/designModules'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import type { DesignBrandRequest } from '../../shared/emailRendering/designBrand'
import type { ModuleAuthority } from '../../server/utils/email-marketing/designModules'
import type { DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { saveStaffTemplateDesignDraft } from '../../server/utils/email-marketing/designRevisions'
import { structuredDesign } from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'

const actorId = '10000000-0000-4000-8000-000000000002'
const draftId = '20000000-0000-4000-8000-000000000001'
const templateId = '30000000-0000-4000-8000-000000000001'
const initial = '40000000-0000-4000-8000-000000000001'
const kitId = '50000000-0000-4000-8000-000000000001'
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
function harness() {
  const source = validateEmailDesign(structuredDesign())
  source.blocks.heading.data.style = { color: '#111111' }
  let state = {
    document: { id: draftId, template_id: templateId, client_id: source.scope.clientId, module_id: null, campaign_id: null, head_revision_id: initial },
    template: { id: templateId, client_id: source.scope.clientId, template_kind: 'draft', subject: null, preview_text: null, body_source: source.blocks, body_html: 'original HTML', email_design_revision_id: initial },
    revisions: { [initial]: { schema_version: 1, payload: source } } as Record<string, any>,
    kit: { id: kitId, client_id: source.scope.clientId, name: 'Client brand', colors: [{ role: 'primary', hex: '#123456' }], fonts: [{ role: 'body', family: 'Private upload', assets: [{ id: crypto.randomUUID(), weight: 400 }] }], logos: [], guidelines: null, is_default: true },
    versions: [] as any[], receipts: {} as Record<string, any>, frozen: { scheduled: 'scheduled HTML', sent: 'sent HTML' }
  }
  let allowed = true, manager = true
  const queries: string[] = []
  const designer = vi.fn(async () => {
    if (!allowed) throw Object.assign(new Error('denied'), { statusCode: 403 })
  })
  const publisher = vi.fn(async () => {
    await designer()
    if (!manager) throw Object.assign(new Error('denied'), { statusCode: 403 })
  })
  const authority: ModuleAuthority = { actorId, read: designer, designer, publisher }
  const rows = (...items: any[]) => ({ rows: items })
  const db = { query: async (sql: string, p: unknown[] = []) => {
    queries.push(sql)
    if (sql.includes('pg_advisory_xact_lock')) return rows()
    if (sql.startsWith('SELECT template_id,client_id') || sql.startsWith('SELECT * FROM email_design_documents')) return rows(state.document)
    if (sql.startsWith('SELECT head_revision_id')) return rows({ head_revision_id: state.document.head_revision_id })
    if (sql.startsWith('SELECT client_id') && sql.includes('FROM edm_templates')) return rows(state.template)
    if (sql.startsWith('SELECT id,client_id,name')) return state.kit.id === p[0] || sql.includes('WHERE client_id=') ? rows(state.kit) : rows()
    if (sql.startsWith('SELECT document_id,revision_id') || sql.startsWith('SELECT document_id, revision_id')) return state.receipts[String(p[1])] ? rows(state.receipts[String(p[1])]) : rows()
    if (sql.startsWith('SELECT schema_version,payload')) return state.revisions[String(p[1])] ? rows(state.revisions[String(p[1])]) : rows()
    if (sql.includes('SELECT d.id AS document_id')) {
      const d = state.document, t = state.template, r = state.revisions[d.head_revision_id]
      return rows({ document_id: d.id, template_id: t.id, document_client_id: d.client_id, template_client_id: t.client_id, template_kind: t.template_kind, head_revision_id: d.head_revision_id, schema_version: r.schema_version, payload: r.payload, projection_revision_id: t.email_design_revision_id, projection_source: t.body_source, legacy_changed: false })
    }
    if (sql.startsWith('SELECT id,version FROM brand_kit_versions')) return rows(...state.versions.filter(v => JSON.stringify(v.snapshot) === p[1]).map(v => ({ id: v.id, version: v.version })))
    if (sql.startsWith('INSERT INTO brand_kit_versions')) {
      const version = { id: crypto.randomUUID(), version: state.versions.length + 1, snapshot: JSON.parse(String(p[1])) }
      state.versions.push(version)
      return rows(version)
    }
    if (sql.includes('SELECT r.schema_version, r.payload')) return rows({ ...state.revisions[String(p[1])], legacy_unchanged: true })
    if (sql.includes('INSERT INTO email_design_revisions')) {
      if (p[1] !== state.document.head_revision_id) throw new Error('parent must be head')
      const id = crypto.randomUUID()
      state.revisions[id] = { schema_version: 1, payload: JSON.parse(String(p[2])), parent_revision_id: p[1] }
      return rows({ id })
    }
    if (sql.startsWith('UPDATE email_design_documents')) {
      state.document.head_revision_id = String(p[1])
      return rows()
    }
    if (sql.startsWith('UPDATE edm_templates')) {
      Object.assign(state.template, { body_source: JSON.parse(String(p[1])), body_html: p[2], email_design_revision_id: p[3] })
      return rows()
    }
    if (sql.includes('INSERT INTO email_design_revision_receipts')) {
      if (state.receipts[String(p[1])]) throw new Error('receipt conflict')
      state.receipts[String(p[1])] = { document_id: p[2], payload_sha256: p[3], revision_id: p[4] }
      return rows()
    }
    // Real schema rejects every receipt mutation. Fixture must reject it too.
    throw new Error(`Unhandled SQL: ${sql}`)
  } }
  const transaction: DesignTransaction = async (callback) => {
    const before = clone(state)
    try {
      return await callback(db)
    } catch (error) {
      state = before
      throw error
    }
  }
  const brand = async (): Promise<DesignBrandRequest> => ({ version: 1, command: 'apply-brand', draftId, operationId: crypto.randomUUID(), expectedRevisionId: state.document.head_revision_id, kitId, kitDigest: await designDigest({ name: state.kit.name, colors: state.kit.colors, fonts: state.kit.fonts, logos: [], guidelines: null }) })
  const lock = (): DesignBrandRequest => ({ version: 1, command: 'set-design-lock', draftId, operationId: crypto.randomUUID(), expectedRevisionId: state.document.head_revision_id, lock: { target: 'block', blockId: 'heading', locked: true } })
  const run = (r: unknown, tx = transaction, renderer = testEmailRenderer) => executeDesignBrand(r, authority, renderer, tx)
  return { get state() {
    return state
  }, db, transaction, run, brand, lock, authority, queries, revoke: () => {
    allowed = false
  }, ordinaryDesigner: () => {
    manager = false
  } }
}
describe('brand/lock canonical persistence', () => {
  it('pins the actual kit/version/defaults and preserves authored content, legal/linked state, and frozen campaigns', async () => {
    const h = harness(), before = clone(h.state)
    const result = await h.run(await h.brand())
    const saved = h.state.revisions[result.revisionId].payload
    expect(saved.blocks).toEqual({ ...before.revisions[initial].payload.blocks, root: { ...before.revisions[initial].payload.blocks.root, data: { ...before.revisions[initial].payload.blocks.root.data, props: { primaryColor: '#123456' } } } })
    expect(saved.policy).toEqual(before.revisions[initial].payload.policy)
    expect(saved.source.brand).toMatchObject({ kitId, versionId: h.state.versions[0].id, version: 1, defaults: { primaryColor: '#123456', fontFamily: 'MODERN_SANS', contentWidth: 600, fontFallback: true } })
    expect(h.state.frozen).toEqual(before.frozen)
    expect(h.queries.some(q => /UPDATE campaigns|UPDATE brand_kits|UPDATE email_design_revision_receipts/.test(q))).toBe(false)
  })
  it('reconciles a lost acknowledgement after both head and kit change and binds every action field', async () => {
    const h = harness(), request = await h.brand()
    const lost: DesignTransaction = async (callback) => {
      await h.transaction(callback)
      throw new Error('lost response')
    }
    await expect(h.run(request, lost)).rejects.toThrow('lost response')
    const first = h.state.document.head_revision_id
    await h.run(h.lock())
    h.state.kit.colors[0].hex = '#abcdef'
    expect((await h.run(request)).revisionId).toBe(first)
    expect(h.state.versions).toHaveLength(1)
    await expect(h.run({ ...request, kitDigest: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await expect(h.run({ ...request, expectedRevisionId: h.state.document.head_revision_id })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    h.revoke()
    await expect(h.run(request)).rejects.toThrow('denied')
  })
  it('domain-separates receipts from generic staff saves even with the same operation identity and canonical design', async () => {
    const h = harness(), request = await h.brand()
    const receipt = await h.run(request)
    await expect(saveStaffTemplateDesignDraft({ documentId: draftId, actorId, operationId: request.operationId, expectedRevisionId: initial, design: h.state.revisions[receipt.revisionId].payload }, h.authority.read, testEmailRenderer, h.transaction)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  it('does not write on stale kit selection, stale expected head, wrong kit scope or authored library target', async () => {
    const h = harness(), request = await h.brand(), before = clone(h.state)
    await expect(h.run({ ...request, kitDigest: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    await expect(h.run({ ...request, expectedRevisionId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(h.state).toEqual(before)
    h.state.kit.client_id = crypto.randomUUID()
    await expect(h.run(request)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    h.state.kit.client_id = h.state.document.client_id
    h.state.template.template_kind = 'library'
    await expect(h.run(request)).rejects.toMatchObject({ code: 'TEMPLATE_DRAFT_REQUIRED' })
    expect(h.state.versions).toHaveLength(0)
  })
  it('preserves content grants when locks change; ordinary designers cannot assign or relax policy', async () => {
    const h = harness(), before = clone(h.state)
    const result = await h.run(h.lock())
    expect(h.state.revisions[result.revisionId].payload.policy).toEqual({ ...before.revisions[initial].payload.policy, designerLocks: { blockIds: ['heading'], styleFields: [] } })
    h.ordinaryDesigner()
    await expect(h.run(h.lock())).rejects.toThrow('denied')
    await expect(h.run({ ...h.lock(), lock: { target: 'block', blockId: 'heading', locked: false } })).rejects.toThrow('denied')
    await expect(h.run({ ...h.lock(), policy: { editableFields: [] } })).rejects.toThrow()
  })
  it('rechecks authority after rendering and atomically rolls back kit versions, source and receipts', async () => {
    const h = harness(), request = await h.brand(), before = clone(h.state)
    const renderer = { ...testEmailRenderer, renderDocument: async (...args: Parameters<typeof testEmailRenderer.renderDocument>) => {
      const html = await testEmailRenderer.renderDocument(...args)
      h.revoke()
      return html
    } }
    await expect(h.run(request, h.transaction, renderer)).rejects.toThrow('denied')
    expect(h.state).toEqual(before)
  })
  it('read-only choices reuse the client default rule and show locks only to agency policy managers', async () => {
    const h = harness(), before = clone(h.state)
    expect(await readDesignBrandOptions(draftId, h.authority, h.db)).toMatchObject({ defaultKitId: kitId, canManageLocks: true, revisionId: initial })
    expect(h.state).toEqual(before)
    h.ordinaryDesigner()
    expect(await readDesignBrandOptions(draftId, h.authority, h.db)).toMatchObject({ canManageLocks: false, lockTargets: [] })
  })
})
