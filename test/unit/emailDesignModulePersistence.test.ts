/* eslint @typescript-eslint/no-explicit-any: off -- Transaction fixture models heterogeneous SQL rows. */
import { describe, expect, it, vi } from 'vitest'
import { executeDesignModules, readImmutableDesignModule, type ModuleAuthority } from '../../server/utils/email-marketing/designModules'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import type { DesignModuleRequest } from '../../shared/emailRendering/designModules'
import type { DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { describeEmailAsset, type DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import { structuredDesign } from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'

const actorId = '10000000-0000-4000-8000-000000000002'
const draftId = '20000000-0000-4000-8000-000000000001'
const templateId = '30000000-0000-4000-8000-000000000001'
const initial = '40000000-0000-4000-8000-000000000001'
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
function harness() {
  let state = {
    documents: { [draftId]: { id: draftId, template_id: templateId, module_id: null, client_id: structuredDesign().scope.clientId, head_revision_id: initial } } as Record<string, any>,
    revisions: { [initial]: { id: initial, document_id: draftId, schema_version: 1, payload: validateEmailDesign(structuredDesign()) } } as Record<string, any>,
    templates: { [templateId]: { id: templateId, client_id: structuredDesign().scope.clientId, template_kind: 'draft', subject: null, preview_text: null, body_source: structuredDesign().blocks, body_html: 'original draft HTML', email_design_revision_id: initial } } as Record<string, any>,
    assets: {} as Record<string, any>, modules: {} as Record<string, any>, receipts: {} as Record<string, any>, campaigns: { sent: 'frozen sent html', scheduled: 'frozen scheduled html' }
  }
  const queries: string[] = []
  let allowed = true
  const check = vi.fn(async (_scope: string | null) => {
    if (!allowed) throw new Error('denied')
  })
  const authority: ModuleAuthority = { actorId, read: check, designer: check, publisher: check }
  const rows = (...items: any[]) => ({ rows: items })
  const db = { query: async (sql: string, p: unknown[] = []) => {
    queries.push(sql)
    if (sql.includes('pg_advisory_xact_lock')) return rows()
    if (sql.startsWith('SELECT operation_id FROM email_asset_publication_receipts')) return rows()
    if (sql.startsWith('SELECT payload FROM email_design_revisions')) {
      const r = state.revisions[String(p[1])]
      return r?.document_id === p[0] ? rows(r) : rows()
    }
    if (sql.startsWith('SELECT * FROM banner_assets')) return state.assets[String(p[0])] ? rows(state.assets[String(p[0])]) : rows()
    if (sql.startsWith('SELECT template_id,client_id')) return state.documents[String(p[0])] ? rows(state.documents[String(p[0])]) : rows()
    if (sql.startsWith('SELECT id FROM edm_templates')) return rows({ id: p[0] })
    if (sql.startsWith('SELECT head_revision_id')) return rows(state.documents[String(p[0])])
    if (sql.includes('FROM email_design_revision_receipts c')) {
      const receipt = state.receipts[String(p[1])]
      return receipt ? rows({ ...receipt, ...state.documents[receipt.document_id] }) : rows()
    }
    if (sql.includes('SELECT d.id AS document_id')) {
      const d = state.documents[String(p[0])], t = state.templates[d?.template_id], r = state.revisions[d?.head_revision_id]
      return !d || !t ? rows() : rows({ document_id: d.id, template_id: t.id, document_client_id: d.client_id, template_client_id: t.client_id, template_kind: t.template_kind, head_revision_id: d.head_revision_id, schema_version: r.schema_version, payload: r.payload, projection_revision_id: t.email_design_revision_id, projection_source: t.body_source, legacy_changed: false })
    }
    if (sql.startsWith('INSERT INTO edm_custom_modules')) {
      const id = crypto.randomUUID()
      state.modules[id] = { id, name: p[0], description: p[1], category: p[2], blocks: JSON.parse(String(p[3])), preview_tone: p[4], client_id: p[5], created_by: p[6] }
      return rows({ id })
    }
    if (sql.startsWith('SELECT client_id FROM edm_custom_modules source_record')) return state.modules[String(p[0])] ? rows(state.modules[String(p[0])]) : rows()
    if (sql.startsWith('SELECT * FROM email_design_documents WHERE module_id') || sql.startsWith('SELECT id,head_revision_id FROM email_design_documents WHERE module_id')) {
      const d = Object.values(state.documents).find(d => d.module_id === p[0])
      return d ? rows(d) : rows()
    }
    if (sql.startsWith('INSERT INTO email_design_documents')) {
      const id = crypto.randomUUID()
      state.documents[id] = { id, template_id: null, module_id: p[0], client_id: p[1], head_revision_id: null }
      return rows(state.documents[id])
    }
    if (sql.includes('INSERT INTO email_design_revisions')) {
      const id = crypto.randomUUID(), legacy = sql.includes('\'legacy\'')
      const document = state.documents[String(p[0])]
      if (legacy && document.head_revision_id) throw new Error('legacy parent guard')
      if (!legacy && document.head_revision_id !== p[1]) throw new Error('parent must be current head')
      state.revisions[id] = { id, document_id: p[0], schema_version: legacy ? 0 : 1, payload: legacy ? clone(state.modules[String(p[2])]) : JSON.parse(String(p[2])), parent_revision_id: legacy ? null : p[1] }
      return rows({ id })
    }
    if (sql.startsWith('UPDATE email_design_documents')) {
      state.documents[String(p[0])].head_revision_id = p[1]
      return rows()
    }
    if (sql.startsWith('UPDATE edm_custom_modules')) {
      Object.assign(state.modules[String(p[0])], { name: p[1], description: p[2], category: p[3], preview_tone: p[4], blocks: JSON.parse(String(p[5])) })
      return rows()
    }
    if (sql.includes('INSERT INTO email_design_revision_receipts')) {
      state.receipts[String(p[1])] = { document_id: p[2], payload_sha256: p[3], revision_id: p[4] }
      return rows()
    }
    if (sql.startsWith('SELECT id,client_id FROM edm_custom_modules')) return state.modules[String(p[0])] ? rows(state.modules[String(p[0])]) : rows()
    if (sql.startsWith('SELECT m.id,m.client_id')) {
      const m = state.modules[String(p[0])], r = state.revisions[String(p[1])], d = state.documents[r?.document_id]
      return !m || !r || d?.module_id !== m.id ? rows() : rows({ ...m, document_id: d.id, document_client_id: d.client_id, head_revision_id: d.head_revision_id, schema_version: r.schema_version, payload: r.payload })
    }
    if (sql.includes('SELECT d.client_id, m.client_id')) {
      const m = state.modules[String(p[0])], r = state.revisions[String(p[1])], d = state.documents[r?.document_id]
      return !m || !r || d?.module_id !== m.id ? rows() : rows({ client_id: d.client_id, owner_client_id: m.client_id, schema_version: r.schema_version, payload: r.payload })
    }
    if (sql.startsWith('SELECT subject,preview_text')) return rows(state.templates[String(p[0])])
    if (sql.startsWith('UPDATE edm_templates')) {
      Object.assign(state.templates[String(p[0])], { body_source: JSON.parse(String(p[1])), body_html: p[2], email_design_revision_id: p[3] })
      return rows()
    }
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
  const run = (request: DesignModuleRequest, tx = transaction, renderer = testEmailRenderer, storage?: DesignAssetStorage) => executeDesignModules(request, authority, renderer, storage, tx)
  const publish = (): DesignModuleRequest => ({ version: 1, command: 'publish-module', operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: initial, rootBlockIds: ['heading'], includedOverridePaths: [], name: 'Hero', category: 'hero', description: null, previewTone: 'light' })
  return { run, publish, transaction, db, authority, queries, get state() {
    return state
  }, revoke: () => {
    allowed = false
  } }
}
describe('canonical module publication transaction boundary', () => {
  it('atomically creates existing-library owner, legacy baseline, immutable successor and one receipt; leaves drafts/campaigns untouched', async () => {
    const h = harness(), before = clone(h.state)
    const result = await h.run(h.publish())
    expect(result.published).toBe(true)
    expect(result.moduleId).toBeTruthy()
    expect(h.state.modules[result.moduleId!].name).toBe('Hero')
    expect(h.state.revisions[result.revisionId].payload.kind).toBe('module')
    expect(Object.values(h.state.revisions).filter(r => r.document_id === result.documentId).map(r => r.schema_version)).toEqual([0, 1])
    expect(h.state.templates).toEqual(before.templates)
    expect(h.state.campaigns).toEqual(before.campaigns)
    expect(Object.keys(h.state.receipts)).toHaveLength(1)
    expect(h.queries.some(q => /UPDATE campaigns|INSERT INTO campaigns/.test(q))).toBe(false)
  })
  it('recovers a lost committed reply without creating another owner and rejects changed payload or target', async () => {
    const h = harness(), request = h.publish()
    const lostReply: DesignTransaction = async (callback) => {
      await h.transaction(callback)

      throw new Error('unknown commit acknowledgement')
    }
    await expect(h.run(request, lostReply)).rejects.toThrow('unknown commit')
    const result = await h.run(request)
    expect(Object.keys(h.state.modules)).toEqual([result.moduleId])
    await expect(h.run({ ...request, name: 'Different' } as DesignModuleRequest)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  it('checks saved current source CAS/projection and authority before publication', async () => {
    const h = harness()
    await expect(h.run({ ...h.publish(), expectedDraftRevisionId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    h.state.templates[templateId].email_design_revision_id = null
    await expect(h.run(h.publish())).rejects.toMatchObject({ code: 'SAVED_DRAFT_REQUIRED' })
    h.revoke()
    await expect(h.run(h.publish())).rejects.toThrow('denied')
    expect(Object.keys(h.state.modules)).toHaveLength(0)
  })
  it('revises only the selected module with expected head, preserving exact old revision selection', async () => {
    const h = harness(), pub = h.publish(), first = await h.run(pub)
    const revisionRequest: DesignModuleRequest = { ...pub, command: 'revise-module', moduleId: first.moduleId!, expectedModuleRevisionId: first.revisionId, operationId: crypto.randomUUID(), name: 'Hero v2' }
    const second = await h.run(revisionRequest)
    expect(second.moduleId).toBe(first.moduleId)
    expect(second.revisionId).not.toBe(first.revisionId)
    expect((await readImmutableDesignModule(first.moduleId!, first.revisionId, h.authority.read, h.db)).revisionId).toBe(first.revisionId)
    await expect(h.run({ ...revisionRequest, operationId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    h.state.modules[first.moduleId!].client_id = crypto.randomUUID()
    await expect(h.run({ ...revisionRequest, operationId: crypto.randomUUID(), expectedModuleRevisionId: second.revisionId })).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' })
    expect(h.state.templates[templateId].body_html).toBe('original draft HTML')
  })
  it('inserts exact revision, updates only on request, and reconciles duplicate draft effects', async () => {
    const h = harness(), module = await h.run(h.publish())
    const insert: DesignModuleRequest = { version: 1, command: 'insert-module', operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: initial, moduleId: module.moduleId!, revisionId: module.revisionId, parentId: 'root', index: 1 }
    const result = await h.run(insert)
    expect((await h.run(insert)).revisionId).toBe(result.revisionId)
    const current = h.state.revisions[result.revisionId].payload
    expect(current.moduleInstances[0].revisionId).toBe(module.revisionId)
    expect(h.state.templates[templateId].body_html).toContain('Hello')
    const detached = await h.run({ version: 1, command: 'detach-module-instance', operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: result.revisionId, instanceId: current.moduleInstances[0].instanceId })
    expect(h.state.revisions[detached.revisionId].payload.blocks).toEqual(current.blocks)
    expect(h.state.revisions[detached.revisionId].payload.moduleInstances).toEqual([])
  })
  it('rechecks authority after asynchronous rendering and rolls back all draft effects on revocation', async () => {
    const h = harness(), module = await h.run(h.publish()), before = clone(h.state)
    const renderer = { ...testEmailRenderer, renderDocument: async (...args: Parameters<typeof testEmailRenderer.renderDocument>) => {
      const html = await testEmailRenderer.renderDocument(...args)

      h.revoke()

      return html
    } }
    await expect(h.run({ version: 1, command: 'insert-module', operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: initial, moduleId: module.moduleId!, revisionId: module.revisionId, parentId: 'root', index: 1 }, h.transaction, renderer)).rejects.toThrow('denied')
    expect(h.state).toEqual(before)
  })
  it('fails visibly on opaque native artifacts and arbitrary image URLs without any library write', async () => {
    const h = harness()
    h.state.revisions[initial].payload.source.nativeArtifact = { id: 'opaque-file', sha256: 'a'.repeat(64) }
    await expect(h.run(h.publish())).rejects.toMatchObject({ code: 'NATIVE_ARTIFACT_STORAGE_UNAVAILABLE' })
    h.state.revisions[initial].payload.source.nativeArtifact = null
    h.state.revisions[initial].payload.blocks.heading = { type: 'Image', data: { props: { url: 'https://untrusted.test/a.png' } } }
    h.state.revisions[initial].payload.policy.editableFields = ['cta.data.props.text', 'cta.data.props.url']
    h.state.templates[templateId].body_source = h.state.revisions[initial].payload.blocks
    await expect(h.run(h.publish())).rejects.toMatchObject({ code: 'ASSET_STORAGE_UNAVAILABLE' })
    expect(Object.keys(h.state.modules)).toHaveLength(0)
  })
  it('inserts only a published registered image and revalidates preserved local image URL overrides', async () => {
    const h = harness()
    const assetId = '70000000-0000-4000-8000-000000000001'
    const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64'))
    const asset = await describeEmailAsset(assetId, bytes)
    const url = `https://app.test/registered/${assetId}`
    h.state.assets[assetId] = { id: assetId, client_id: structuredDesign().scope.clientId, uploaded_by: actorId, r2_key: `banner-assets/${actorId}/80000000-0000-4000-8000-000000000001/image.png`, file_size: bytes.length, mime_type: 'image/png', email_publication: asset }
    const storage: DesignAssetStorage = { read: async () => bytes, url: async () => url, identifyUrl: async value => value === url ? assetId : null }
    const image = await h.run({ version: 1, command: 'insert-published-image', operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: initial, assetId, parentId: 'root', index: 0 }, h.transaction, testEmailRenderer, storage)
    const current = h.state.revisions[image.revisionId].payload
    expect(current.assets).toEqual([asset])
    const imageRoot = current.blocks.root.data.childrenIds[0]
    expect(current.policy.editableFields).not.toContain(`${imageRoot}.data.props.url`)
    // A trusted persisted source can carry legacy URL edit grants. Publication
    // preserves those grants but any later preserved URL must be checked again.
    current.policy.editableFields.push(`${imageRoot}.data.props.url`)
    const pub = { ...h.publish(), operationId: crypto.randomUUID(), expectedDraftRevisionId: image.revisionId, rootBlockIds: [imageRoot] } as DesignModuleRequest
    const module = await h.run(pub, h.transaction, testEmailRenderer, storage)
    const inserted = await h.run({ version: 1, command: 'insert-module', operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: image.revisionId, moduleId: module.moduleId!, revisionId: module.revisionId, parentId: 'root', index: 0 }, h.transaction, testEmailRenderer, storage)
    const edited = h.state.revisions[inserted.revisionId].payload
    const instance = edited.moduleInstances[0]
    edited.blocks[instance.rootBlockIds[0]].data.props.url = 'https://untrusted.test/replacement.png'
    h.state.templates[templateId].body_source = edited.blocks
    await expect(h.run({ version: 1, command: 'update-module-instance', operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: inserted.revisionId, instanceId: instance.instanceId, revisionId: module.revisionId, overrides: 'preserve' }, h.transaction, testEmailRenderer, storage)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    const discarded = await h.run({ version: 1, command: 'update-module-instance', operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: inserted.revisionId, instanceId: instance.instanceId, revisionId: module.revisionId, overrides: 'discard' }, h.transaction, testEmailRenderer, storage)
    expect(h.state.revisions[discarded.revisionId].payload.blocks[instance.rootBlockIds[0]].data.props.url).toBe(url)
  })
})

describe('module publication preserves pinned source authority', () => {
  it('retains the brand snapshot when extracting a published module', async () => {
    const h = harness()
    const brand = { kitId: crypto.randomUUID(), versionId: crypto.randomUUID(), version: 1, name: 'Dealer', defaults: { primaryColor: '#123456', fontFamily: 'MODERN_SANS', contentWidth: 600, fontFallback: false, requestedFont: null } }
    h.state.revisions[initial].payload.source.brand = brand
    const published = await h.run(h.publish())
    expect(h.state.revisions[published.revisionId].payload.source.brand).toEqual(brand)
  })
  it('reauthorizes immutable module selection on receipt replay', async () => {
    const h = harness(), request = h.publish()
    await h.run(request)
    let reads = 0
    h.authority.read = async () => {
      if (++reads > 1) throw new Error('module read revoked')
    }
    await expect(h.run(request)).rejects.toThrow('module read revoked')
  })
})
