import fs from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { executeDesignerRoundtrip, executeDesignRoundtrip } from '../../server/utils/email-marketing/designHandoffs'
import { ensureLegacyDesignDocument, saveTemplateDesignDraft, saveStaffTemplateDesignDraft, type DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { getTemplateDesignDraft } from '../../server/utils/email-marketing/designReads'
import type { DesignerOperation, DesignerRoundtripRequest } from '../../shared/emailRendering/designDesigner'
import type { DesignHandoff } from '../../shared/emailRendering/designRoundtrip'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'
import { executeDesignModules, readImmutableDesignModule } from '../../server/utils/email-marketing/designModules'
import { publishEmailAsset } from '../../server/utils/email-marketing/designAssets'
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
const authority = () => ({ actorId, authorize: async (clientId: string | null) => {
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
      for (const file of ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '493_email_design_handoffs.sql', '494_email_merge_tag_definitions.sql', '495_email_asset_publication.sql']) {
        await admin.query(fs.readFileSync(new URL(`../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
      }
    }
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
})
