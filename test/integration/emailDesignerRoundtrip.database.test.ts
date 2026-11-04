import fs from 'node:fs'
import { createEmptyDocument } from '../../app/types/edm'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { executeDesignerRoundtrip, executeDesignRoundtrip } from '../../server/utils/email-marketing/designHandoffs'
import { ensureLegacyDesignDocument, saveDerivedTemplateDesignDraft, saveTemplateDesignDraft, saveStaffTemplateDesignDraft, type DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { getTemplateDesignDraft } from '../../server/utils/email-marketing/designReads'
import type { DesignerOperation, DesignerRoundtripRequest } from '../../shared/emailRendering/designDesigner'
import type { DesignHandoff } from '../../shared/emailRendering/designRoundtrip'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'
import { executeDesignModules, readImmutableDesignModule } from '../../server/utils/email-marketing/designModules'
import { publishEmailAsset } from '../../server/utils/email-marketing/designAssets'
import { executeDesignBrand, readDesignBrandOptions } from '../../server/utils/email-marketing/designBrand'
import { saveDesignCondition } from '../../server/utils/email-marketing/designConditions'
import { testEmailRenderer } from '../fixtures/emailRenderer'

const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const databaseTest = socket ? it : it.skip
const scope = structuredDesign().scope.clientId
const schema = `figflow_designer_test_${Date.now()}`
const config = () => ({ host: socket, port: 55483, user: 'figflow_test', database: 'figflow_design_test' })
let admin: pg.Client
let documentId: string
let templateId: string
let actorId: string
let head: string
let role: 'staff' | 'designer' = 'designer'
const transaction: DesignTransaction = async (callback) => {
  const db = new pg.Client(config())
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query(`SET LOCAL search_path TO ${schema}, public`)
    const result = await callback(db)
    await db.query('COMMIT')
    return result
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally { await db.end() }
}
const authority = () => ({ actorId, assertCampaignNativeEnabled: () => { throw Object.assign(new Error('not_found'), { statusCode: 404 }) }, authorize: async (clientId: string | null) => {
  if (clientId !== scope) throw new Error('scope denied')
  return role
} })
async function designer(request: DesignerRoundtripRequest, tx = transaction) {
  const result = await executeDesignerRoundtrip(request, authority(), testEmailRenderer, tx)
  if (!('handoff' in result)) throw new Error('Expected handoff')
  return result
}
const open = () => designer({ command: 'open', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: head })
const propose = (handoff: DesignHandoff, operations: DesignerOperation[]) => designer({ command: 'propose', handoffId: handoff.id, action: {
  version: 1, action: 'propose-designer-return', operationId: crypto.randomUUID(), scope: { clientId: scope }, draftId: documentId, baseRevisionId: handoff.baseRevisionId, operations
} })
const apply = (handoff: DesignHandoff): DesignerRoundtripRequest => ({ command: 'apply', handoffId: handoff.id, action: {
  version: 1, action: 'apply-return', operationId: crypto.randomUUID(), scope: { clientId: scope }, proposalId: handoff.id,
  expectedProposalRevisionId: handoff.proposalRevisionId!, expectedDraftRevisionId: handoff.baseRevisionId
} })

describe('designer authority with real PostgreSQL transactions', () => {
  beforeAll(async () => {
    if (!socket) return
    if (!socket.startsWith('/private/tmp/figflow-postgres-')) throw new Error('Requires isolated FigFlow PostgreSQL fixture')
    admin = new pg.Client(config())
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}, public`)
    await admin.query('CREATE TABLE agency_clients(id uuid PRIMARY KEY); CREATE TABLE edm_templates(id uuid PRIMARY KEY, client_id uuid, body_source jsonb, body_html text, subject text, preview_text text, template_kind text DEFAULT \'draft\', updated_at timestamptz DEFAULT now()); CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, blocks jsonb, name text, description text, category text, preview_tone text, created_by uuid, updated_at timestamptz DEFAULT now()); CREATE TABLE banner_assets(id uuid PRIMARY KEY, client_id uuid, uploaded_by uuid, r2_key text, url text, mime_type text, file_size integer); CREATE TABLE campaigns(id uuid PRIMARY KEY, client_id uuid, status text)')
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const file of ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '493_email_design_handoffs.sql', '494_email_merge_tag_definitions.sql', '495_email_asset_publication.sql', '496_email_content_conditions.sql']) {
        await admin.query(fs.readFileSync(new URL(`../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
      }
    }
    await admin.query('CREATE TABLE brand_kits(id uuid PRIMARY KEY,client_id uuid,name text,colors jsonb,fonts jsonb,logos jsonb,guidelines text,is_default boolean); CREATE TABLE brand_kit_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),brand_kit_id uuid,version integer,snapshot jsonb,note text,created_by uuid,UNIQUE(brand_kit_id,version))')
    await admin.query('INSERT INTO agency_clients VALUES($1)', [scope])
  })
  beforeEach(async () => {
    if (!socket) return
    role = 'designer'
    documentId = crypto.randomUUID()
    templateId = crypto.randomUUID()
    actorId = crypto.randomUUID()
    await admin.query('INSERT INTO edm_templates(id,client_id) VALUES($1,$2)', [templateId, scope])
    await admin.query('INSERT INTO email_design_documents(id,template_id,client_id) VALUES($1,$2,$3)', [documentId, templateId, scope])
    const baseline = await ensureLegacyDesignDocument({ kind: 'template', ownerId: templateId, actorId }, async () => {}, transaction)
    const saved = await saveTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: baseline.revisionId, design: structuredDesign() }, async () => {}, testEmailRenderer, transaction)
    head = saved.revisionId
  })
  afterAll(async () => {
    if (!admin) return
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
  })
  databaseTest('starts, proposes and applies a scoped template while campaign native authority is closed', async () => {
    const started = await designer({ command: 'start', operationId: crypto.randomUUID(), templateId, clientId: scope })
    const proposed = await propose(started.handoff, [{ op: 'set-style', blockId: 'heading', style: { color: '#123456' } }])
    const applied = await designer(apply(proposed.handoff))
    expect(applied.handoff.state).toBe('applied')
    role = 'staff'
    await expect(designer({ command: 'start', operationId: crypto.randomUUID(), templateId, clientId: scope })).rejects.toMatchObject({ code: 'DESIGNER_REQUIRED' })
    role = 'designer'
    await expect(designer({ command: 'start', operationId: crypto.randomUUID(), templateId, clientId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  databaseTest('pins exact brand snapshots, applies locks atomically, and binds condition no-op receipts by target', async () => {
    const access = {
      actorId,
      read: async (clientId: string | null) => { if (clientId !== scope) throw new Error('scope denied') },
      designer: async (clientId: string | null) => { if (role !== 'designer' || clientId !== scope) throw new Error('designer denied') },
      publisher: async (clientId: string | null) => { if (role !== 'designer' || clientId !== scope) throw new Error('publisher denied') }
    }
    const kitId = crypto.randomUUID()
    await admin.query('INSERT INTO brand_kits(id,client_id,name,colors,fonts,logos,is_default) VALUES($1,$2,$3,$4,$5,$6,true)', [kitId, scope, 'Synthetic brand', JSON.stringify([{ role: 'primary', hex: '#112233' }]), JSON.stringify([{ role: 'body', family: 'Georgia' }]), '[]'])
    const options = await readDesignBrandOptions(documentId, access, admin)
    const request = { version: 1, command: 'apply-brand', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: head, kitId, kitDigest: options.kits.find(k => k.id === kitId)!.digest }
    const brand = await executeDesignBrand(request, access, testEmailRenderer, transaction)
    await admin.query('UPDATE brand_kits SET colors=$2 WHERE id=$1', [kitId, JSON.stringify([{ role: 'primary', hex: '#abcdef' }])])
    expect(await executeDesignBrand(request, access, testEmailRenderer, transaction)).toEqual(brand)
    const current = await getTemplateDesignDraft(documentId, access.read, admin)
    if (current.state !== 'structured') throw new Error('Expected structured head')
    expect(current.source.source.brand?.defaults.primaryColor).toBe('#112233')
    expect(current.source.blocks.root.data.props?.fontFamily).toBeUndefined()
    expect(current.source.blocks.heading).toEqual(structuredDesign().blocks.heading)
    const clear = { documentId, expectedRevisionId: brand.revisionId, operationId: crypto.randomUUID(), blockId: 'heading', condition: null }
    const save: typeof saveDerivedTemplateDesignDraft = (input, auth, render, digest, _tx, deps) => saveDerivedTemplateDesignDraft(input, auth, render, digest, transaction, deps)
    const conditionAccess = { actorId, authorize: async (clientId: string | null) => {
      await access.designer(clientId)
      return 'designer' as const
    } }
    const cleared = await saveDesignCondition(clear, conditionAccess, testEmailRenderer, admin.query.bind(admin), save)
    expect(await saveDesignCondition(clear, conditionAccess, testEmailRenderer, admin.query.bind(admin), save)).toEqual(cleared)
    await expect(saveDesignCondition({ ...clear, blockId: 'cta' }, conditionAccess, testEmailRenderer, admin.query.bind(admin), save)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    const locked = await executeDesignBrand({ version: 1, command: 'set-design-lock', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: cleared.revisionId, lock: { blockId: 'heading', target: 'block', locked: true } }, access, testEmailRenderer, transaction)
    await expect(saveDesignCondition({ ...clear, expectedRevisionId: locked.revisionId, operationId: crypto.randomUUID(), condition: { version: 1, name: 'Name', predicate: { field: 'first_name', op: 'exists' } } }, conditionAccess, testEmailRenderer, admin.query.bind(admin), save)).rejects.toThrow('PROTECTED_CONDITION_TARGET')
    role = 'staff'
    await expect(executeDesignBrand(request, access, testEmailRenderer, transaction)).rejects.toThrow('designer denied')
  })
  databaseTest('publishes and pins modules without retroactively updating instances, then explicitly updates and detaches', async () => {
    const access = {
      actorId,
      read: async (clientId: string | null) => { if (clientId !== scope) throw new Error('scope denied') },
      designer: async (clientId: string | null) => { if (clientId !== scope) throw new Error('scope denied') },
      publisher: async (clientId: string | null) => { if (clientId !== scope) throw new Error('publisher denied') }
    }
    const metadata = { name: 'Synthetic heading', category: 'test', description: null, previewTone: 'light', includedOverridePaths: [], rootBlockIds: ['heading'] }
    const publish = { version: 1, command: 'publish-module', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: head, ...metadata }
    const first = await executeDesignModules(publish, access, testEmailRenderer, undefined, transaction)
    expect(await executeDesignModules(publish, access, testEmailRenderer, undefined, transaction)).toEqual(first)
    expect(first.moduleId).toBeTruthy()
    const inserted = await executeDesignModules({ version: 1, command: 'insert-module', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: head, moduleId: first.moduleId, revisionId: first.revisionId, parentId: 'root', index: 2 }, access, testEmailRenderer, undefined, transaction)
    let current = await getTemplateDesignDraft(documentId, access.read, admin)
    if (current.state !== 'structured') throw new Error('Expected structured head')
    expect(current.source.moduleInstances).toHaveLength(1)
    const instanceId = current.source.moduleInstances[0].instanceId
    const edited = validateEmailDesign(current.source)
    edited.blocks.heading.data.props!.text = 'Updated {{first_name}}'
    const changed = await saveStaffTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: inserted.revisionId, design: edited }, access.designer, testEmailRenderer, transaction, { authorizeModuleRead: async (_id, clientId) => access.read(clientId) })
    const revised = await executeDesignModules({ version: 1, command: 'revise-module', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: changed.revisionId, moduleId: first.moduleId, expectedModuleRevisionId: first.revisionId, ...metadata }, access, testEmailRenderer, undefined, transaction)
    current = await getTemplateDesignDraft(documentId, access.read, admin)
    if (current.state !== 'structured') throw new Error('Expected structured head')
    expect(current.source.moduleInstances[0].revisionId).toBe(first.revisionId)
    const old = await readImmutableDesignModule(first.moduleId!, first.revisionId, access.read, admin)
    expect(old.design.blocks.heading.data.props?.text).toBe('Hello {{first_name}}')
    const updated = await executeDesignModules({ version: 1, command: 'update-module-instance', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: changed.revisionId, instanceId, revisionId: revised.revisionId, overrides: 'preserve' }, access, testEmailRenderer, undefined, transaction)
    const detached = await executeDesignModules({ version: 1, command: 'detach-module-instance', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: updated.revisionId, instanceId }, access, testEmailRenderer, undefined, transaction)
    current = await getTemplateDesignDraft(documentId, access.read, admin)
    if (current.state !== 'structured') throw new Error('Expected structured head')
    expect(current.headRevisionId).toBe(detached.revisionId)
    expect(current.source.moduleInstances).toEqual([])
    expect(current.source.dependencies).toEqual([])
    expect(Object.values(current.source.blocks).filter(block => block.data.props?.text === 'Updated {{first_name}}')).toHaveLength(2)
    await expect(admin.query('UPDATE edm_custom_modules SET blocks=\'{}\'::jsonb WHERE id=$1', [first.moduleId])).rejects.toMatchObject({ code: '55000' })
  })
  databaseTest('freezes verified asset identity and its publication receipt in PostgreSQL', async () => {
    const assetId = crypto.randomUUID()
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64'))
    await admin.query('INSERT INTO banner_assets(id,client_id,uploaded_by,r2_key,url,mime_type,file_size) VALUES($1,$2,$3,$4,$5,$6,$7)', [assetId, scope, actorId, `banner-assets/${actorId}/${crypto.randomUUID()}/image.png`, 'https://example.invalid/registered', 'image/png', png.length])
    const storage = { read: async () => png, url: async () => 'https://example.invalid/registered', identifyUrl: async () => assetId }
    const request = { version: 1, operationId: crypto.randomUUID(), assetId }
    const publish = () => publishEmailAsset(request, actorId, async (clientId) => {
      if (clientId !== scope) throw new Error('scope denied')
    }, storage, transaction)
    const receipt = await publish()
    expect(await publish()).toEqual(receipt)
    await expect(admin.query('UPDATE banner_assets SET client_id=NULL WHERE id=$1', [assetId])).rejects.toMatchObject({ code: '55000' })
    await expect(admin.query('UPDATE banner_assets SET url=$2 WHERE id=$1', [assetId, 'https://foreign.invalid/changed'])).rejects.toMatchObject({ code: '55000' })
    await expect(admin.query('DELETE FROM banner_assets WHERE id=$1', [assetId])).rejects.toMatchObject({ code: '55000' })
    await expect(admin.query('UPDATE email_asset_publication_receipts SET descriptor=$2::jsonb WHERE actor_id=$1', [actorId, '{}'])).rejects.toMatchObject({ code: '55000' })
  })
  databaseTest('keeps proposal separate, then atomically saves canonical styles and exact replay receipt', async () => {
    const opened = await open()
    const proposed = await propose(opened.handoff, [
      { op: 'set-style', blockId: 'heading', style: { color: '#123456' } },
      { op: 'set-props', blockId: 'root', props: { contentWidth: 680 } }
    ])
    expect((await getTemplateDesignDraft(documentId, async () => {}, admin)).headRevisionId).toBe(head)
    expect(proposed.preview.html).toContain('#123456')
    expect(proposed.preview.html).toContain('width="680"')
    const request = apply(proposed.handoff)
    let lost = false
    const loseReply: DesignTransaction = async (callback) => {
      const result = await transaction(callback)
      if (!lost) {
        lost = true
        throw new Error('Committed reply lost')
      }
      return result
    }
    await expect(designer(request, loseReply)).rejects.toThrow('Committed reply lost')
    const recovered = await designer(request)
    const replay = await designer(request)
    expect(replay.handoff.appliedRevisionId).toBe(recovered.handoff.appliedRevisionId)
    const stored = await getTemplateDesignDraft(documentId, async () => {}, admin)
    expect(stored.state).toBe('structured')
    if (stored.state !== 'structured') throw new Error('Expected structured head')
    expect(stored.source.blocks.heading.data.style).toEqual({ color: '#123456' })
    expect(stored.source.blocks.root.data.props?.contentWidth).toBe(680)
    expect(stored.projection.state).toBe('current')
    const owner = (await admin.query('SELECT body_html,email_design_revision_id FROM edm_templates WHERE id=$1', [templateId])).rows[0]
    expect(owner.email_design_revision_id).toBe(stored.headRevisionId)
    expect(owner.body_html).toContain('width="680"')
    expect((await admin.query('SELECT count(*)::int AS count FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, 'action' in request ? request.action.operationId : null])).rows[0].count).toBe(1)
  })
  databaseTest('binds persisted mode and rechecks designer authority before Apply', async () => {
    const opened = await open()
    await expect(executeDesignRoundtrip({ command: 'resume', handoffId: opened.handoff.id }, authority(), testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'HANDOFF_MODE_MISMATCH' })
    const proposed = await propose(opened.handoff, [{ op: 'set-style', blockId: 'heading', style: { fontSize: 28 } }])
    role = 'staff'
    await expect(designer(apply(proposed.handoff))).rejects.toMatchObject({ code: 'DESIGNER_REQUIRED' })
    expect((await getTemplateDesignDraft(documentId, async () => {}, admin)).headRevisionId).toBe(head)
  })
  databaseTest('allows exactly one concurrent staff save or designer Apply from the same base', async () => {
    const opened = await open()
    const proposed = await propose(opened.handoff, [{ op: 'set-style', blockId: 'heading', style: { color: '#123456' } }])
    const content = validateEmailDesign(structuredDesign())
    content.blocks.heading.data.props!.text = 'Staff {{first_name}}'
    const results = await Promise.allSettled([
      designer(apply(proposed.handoff)),
      saveStaffTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: head, design: content }, async () => {}, testEmailRenderer, transaction)
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ code: 'REVISION_CONFLICT' })
    const stored = await getTemplateDesignDraft(documentId, async () => {}, admin)
    expect(stored.projection.state).toBe('current')
  })
  // E01 cases use fresh never-initialized owners; the structured beforeEach
  // fixture cannot prove atomic first-start rollback or raw JSONB admission.
  async function freshBlank(clientId: string | null = scope) {
    templateId = crypto.randomUUID()
    await admin.query('INSERT INTO edm_templates(id,client_id,body_source) VALUES($1,$2,$3::jsonb)', [templateId, clientId, JSON.stringify(createEmptyDocument())])
    return { command: 'start' as const, operationId: crypto.randomUUID(), templateId, clientId }
  }
  async function blankEffects(operationId: string) {
    const counts = (await admin.query(`SELECT
      (SELECT count(*)::int FROM email_design_documents WHERE template_id=$1) AS documents,
      (SELECT count(*)::int FROM email_design_revisions r JOIN email_design_documents d ON d.id=r.document_id WHERE d.template_id=$1) AS revisions,
      (SELECT count(*)::int FROM email_design_handoffs h JOIN email_design_documents d ON d.id=h.document_id WHERE d.template_id=$1) AS handoffs,
      (SELECT count(*)::int FROM email_design_revision_receipts rr JOIN email_design_documents d ON d.id=rr.document_id WHERE d.template_id=$1) AS writes,
      (SELECT count(*)::int FROM email_design_handoff_receipts WHERE actor_id=$2 AND operation_id=$3) AS receipts`, [templateId, actorId, operationId])).rows[0]
    const owner = (await admin.query('SELECT body_source,body_html,email_design_revision_id,updated_at FROM edm_templates WHERE id=$1', [templateId])).rows[0]
    return { counts, owner }
  }
  databaseTest.each(['content', 'staff', 'renderer', 'revoked-during-render'] as const)('E01 real transaction rolls fresh blank %s refusal back with zero writes', async (failure) => {
    const request = await freshBlank()
    const before = await blankEffects(request.operationId)
    let renderCount = 0
    const renderer = { ...testEmailRenderer, renderDocument: async (...args: Parameters<typeof testEmailRenderer.renderDocument>) => {
      renderCount++
      if (failure === 'renderer') throw new Error('conversion render failed')
      if (failure === 'revoked-during-render') role = 'staff'
      return testEmailRenderer.renderDocument(...args)
    } }
    if (failure === 'staff') role = 'staff'
    const run = failure === 'content' ? executeDesignRoundtrip : executeDesignerRoundtrip
    await expect(run(request, authority(), renderer, transaction)).rejects.toMatchObject(failure === 'renderer' ? { message: 'conversion render failed' } : { code: failure === 'content' ? 'NO_EDITABLE_CONTENT' : 'DESIGNER_REQUIRED' })
    expect(await blankEffects(request.operationId)).toEqual(before)
    expect(before.counts).toEqual({ documents: 0, revisions: 0, handoffs: 0, writes: 0, receipts: 0 })
    if (failure === 'renderer' || failure === 'revoked-during-render') expect(renderCount).toBe(1)
  })
  databaseTest.each([false, true])('E01 committed lost reply replays once, shared-null=%s', async (shared) => {
    const request = await freshBlank(shared ? null : scope)
    const access = { ...authority(), authorize: async (clientId: string | null) => {
      if (clientId !== request.clientId) throw new Error('scope denied')
      return role
    } }
    const loseReply: DesignTransaction = async callback => { await transaction(callback); throw new Error('committed reply lost') }
    await expect(executeDesignerRoundtrip(request, access, testEmailRenderer, loseReply)).rejects.toThrow('committed reply lost')
    const first = await executeDesignerRoundtrip(request, access, testEmailRenderer, transaction)
    const replay = await executeDesignerRoundtrip(request, access, testEmailRenderer, transaction)
    expect(replay).toEqual(first)
    const committed = await blankEffects(request.operationId)
    // One immutable schema0 snapshot plus one conversion revision.
    expect(committed.counts).toEqual({ documents: 1, revisions: 2, handoffs: 1, writes: 1, receipts: 1 })
    await expect(executeDesignerRoundtrip({ ...request, clientId: crypto.randomUUID() }, access, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(await blankEffects(request.operationId)).toEqual(committed)
    role = 'staff'
    await expect(executeDesignerRoundtrip(request, access, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'DESIGNER_REQUIRED' })
    expect(await blankEffects(request.operationId)).toEqual(committed)
  })
  databaseTest('E01 raw JSONB blank discovery preserves schema0 drift and initialized-owner distinctions', async () => {
    const request = await freshBlank()
    const lookup = () => executeDesignRoundtrip({ command: 'lookup', templateId }, authority(), testEmailRenderer, transaction)
    expect(await lookup()).toMatchObject({ draft: null, blankDesignerSource: { policy: { editableFields: [] } } })
    const legacy = await ensureLegacyDesignDocument({ kind: 'template', ownerId: templateId, actorId }, async () => {}, transaction)
    expect(await lookup()).toMatchObject({ draft: { state: 'legacy', ownerChangedSinceSnapshot: false }, blankDesignerSource: { kind: 'template' } })
    await admin.query('UPDATE edm_templates SET subject=$2 WHERE id=$1', [templateId, 'changed owner but same exact blank'])
    expect(await lookup()).not.toHaveProperty('blankDesignerSource')
    await expect(designer(request)).rejects.toMatchObject({ code: 'LEGACY_CONTENT_CHANGED' })
    expect((await blankEffects(request.operationId)).counts).toEqual({ documents: 1, revisions: 1, handoffs: 0, writes: 0, receipts: 0 })
    expect((await getTemplateDesignDraft(legacy.documentId, async () => {}, admin)).state).toBe('legacy')
  })
  databaseTest.each(['Heading', 'Text', 'Button'] as const)('E01 blank-derived %s previews then Applies one revision and reopens exact head', async (sectionType) => {
    const request = await freshBlank()
    const opened = await designer(request)
    documentId = opened.handoff.draftId
    head = opened.handoff.baseRevisionId
    const proposed = await propose(opened.handoff, [{ op: 'add-section', parentId: 'root', index: 0, sectionType }])
    expect(proposed.preview.html).toContain('<')
    const saved = await designer(apply(proposed.handoff))
    const stored = await getTemplateDesignDraft(documentId, async () => {}, admin)
    expect(stored).toMatchObject({ state: 'structured', headRevisionId: saved.handoff.appliedRevisionId, projection: { state: 'current' } })
    const reopened = await designer({ command: 'open', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: stored.headRevisionId })
    expect(Object.values(reopened.handoff.source.blocks).some(block => block.type === sectionType)).toBe(true)
    expect((await blankEffects(request.operationId)).counts.revisions).toBe(3)
    await expect(designer({ command: 'open', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: head })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  })
  databaseTest('E01 registered Image uses insert-published-image on the blank-derived head, then preview/Apply/readback/reopen', async () => {
    const request = await freshBlank()
    const opened = await designer(request)
    documentId = opened.handoff.draftId
    const assetId = crypto.randomUUID()
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64'))
    const url = 'https://example.invalid/e01-registered.png'
    await admin.query('INSERT INTO banner_assets(id,client_id,uploaded_by,r2_key,url,mime_type,file_size) VALUES($1,$2,$3,$4,$5,$6,$7)', [assetId, scope, actorId, `banner-assets/${actorId}/${crypto.randomUUID()}/image.png`, url, 'image/png', png.length])
    const storage = { read: async () => png, url: async () => url, identifyUrl: async () => assetId }
    const access = { actorId, read: async (clientId: string | null) => { if (clientId !== scope) throw new Error('scope denied') }, designer: async () => { if (role !== 'designer') throw new Error('designer denied') }, publisher: async () => {} }
    await publishEmailAsset({ version: 1, operationId: crypto.randomUUID(), assetId }, actorId, access.read, storage, transaction)
    const inserted = await executeDesignModules({ version: 1, command: 'insert-published-image', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: opened.handoff.baseRevisionId, assetId, parentId: 'root', index: 0 }, access, testEmailRenderer, storage, transaction)
    const imageHead = await designer({ command: 'open', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: inserted.revisionId })
    const imageId = Object.keys(imageHead.handoff.source.blocks).find(id => imageHead.handoff.source.blocks[id]!.type === 'Image')!
    const proposed = await propose(imageHead.handoff, [{ op: 'set-props', blockId: imageId, props: { alt: 'Registered blank image' } }])
    expect(proposed.preview.html).toContain(url)
    const saved = await designer(apply(proposed.handoff))
    const reopened = await designer({ command: 'open', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: saved.handoff.appliedRevisionId! })
    expect(reopened.handoff.source.blocks[imageId]).toMatchObject({ type: 'Image', data: { props: { url, alt: 'Registered blank image' } } })
    expect(reopened.handoff.source.assets.map(asset => asset.id)).toContain(assetId)
  })

})
