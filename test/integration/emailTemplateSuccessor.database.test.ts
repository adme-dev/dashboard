import fs from 'node:fs'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeDesignTemplates, readImmutableDesignTemplate } from '../../server/utils/email-marketing/designTemplates'
import { executeDesignModules, appendModuleOrDraft, type ModuleAuthority } from '../../server/utils/email-marketing/designModules'
import { ensureLegacyDesignDocument, saveTemplateDesignDraft, saveStaffTemplateDesignDraft, saveCampaignDesignDraft, type DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { createCampaignFromTemplateRevision } from '../../server/utils/email-marketing/designCampaigns'
import { saveTemplateDraftMetadata } from '../../server/utils/email-marketing/designMetadata'
import { runReviewCommand, loadReviewTarget } from '../../server/utils/email-marketing/review'
import * as templateDb from '../../server/utils/db'
import { updateTemplate } from '../../server/utils/email-marketing/templates'
import { getDesignDraft } from '../../server/utils/email-marketing/designReads'
import { publishDesignLibraryAsset } from '../../server/utils/email-marketing/designLibraryOperations'
import type { DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import { validateEmailDesign, type EmailDesignDocument } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'

const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const databaseTest = socket ? it : it.skip
const config = () => ({ host: socket, port: 55483, user: 'figflow_test', database: 'figflow_design_test', connectionTimeoutMillis: 5000 })
const scope = structuredDesign().scope.clientId
const otherScope = '10000000-0000-4000-8000-000000000002'
const cleanups: string[] = []

describe.each([false, true])('template successor with M06=%s (real disposable PostgreSQL)', (withReview) => {
  const schema = `figflow_template_successor_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: pg.Client
  let actorId: string, sourceTemplate: string, sourceDocument: string, sourceHead: string, target: { templateId: string, documentId: string, revisionId: string }
  let source: EmailDesignDocument, assetId: string, moduleId: string, moduleRevision: string
  let deniedRead = false, deniedPublisher = false, badBytes = false
  const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64'))
  const storage: DesignAssetStorage = { read: async () => badBytes ? new Uint8Array() : bytes, url: async id => `https://example.invalid/registered/${id}`, identifyUrl: async url => url.startsWith('https://example.invalid/registered/') ? url.split('/').at(-1)! : null }
  const read = async (clientId: string | null) => {
    if (deniedRead || clientId !== scope) throw new Error('fresh source/target read denied')
  }
  const publisher = async (clientId: string | null) => {
    if (deniedPublisher || clientId !== scope) throw new Error('fresh source/target publisher denied')
  }
  const authority = (): ModuleAuthority => ({ actorId, read, publisher, designer: read })
  const transaction: DesignTransaction = async (callback) => {
    const db = new pg.Client(config())
    await db.connect()
    try {
      await db.query('BEGIN')
      await db.query(`SET LOCAL search_path TO ${schema}`)
      await db.query('SET LOCAL statement_timeout=\'10s\'; SET LOCAL lock_timeout=\'5s\'')
      const result = await callback(db)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    } finally {
      await db.end()
    }
  }
  function concurrentTransactions(): DesignTransaction {
    let arrived = 0
    let release!: () => void
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    return callback => transaction(async (db) => {
      if (++arrived === 2) release()
      await ready
      return callback(db)
    })
  }
  const publish = (input: unknown, tx = transaction, renderer = testEmailRenderer, auth = authority()) => executeDesignTemplates(input, auth, renderer, storage, tx)
  const request = (operationId = crypto.randomUUID(), expectedTemplateRevisionId = target.revisionId) => ({ version: 1, command: 'revise-template', operationId, draftId: sourceDocument, expectedRevisionId: sourceHead,
    templateId: target.templateId, expectedTemplateRevisionId, name: 'Successor publication', category: 'Offers', includedOverridePaths: [] as string[] })
  const owner = () => admin.query('SELECT * FROM edm_templates WHERE id=$1', [target.templateId]).then(r => r.rows[0])
  const snapshot = async () => ({ owner: await owner(), documents: (await admin.query('SELECT id,head_revision_id FROM email_design_documents ORDER BY id')).rows,
    revisions: (await admin.query('SELECT id FROM email_design_revisions ORDER BY id')).rows, receipts: (await admin.query('SELECT actor_id,operation_id,revision_id FROM email_design_revision_receipts ORDER BY actor_id,operation_id')).rows,
    campaigns: (await admin.query('SELECT * FROM campaigns ORDER BY id')).rows })
  async function saveSource(text: string, subject = 'Saved successor subject') {
    const current = await getDesignDraft(sourceDocument, read, admin)
    if (current.state !== 'structured') throw new Error('structured source required')
    const next = validateEmailDesign(current.source)
    next.blocks.heading.data.props!.text = text
    sourceHead = (await saveTemplateDesignDraft({ documentId: sourceDocument, actorId, operationId: crypto.randomUUID(), expectedRevisionId: sourceHead, design: next }, read, testEmailRenderer, transaction,
      { authorizeModuleRead: (_id, client) => read(client) })).revisionId
    sourceHead = (await saveTemplateDraftMetadata({ documentId: sourceDocument, actorId, operationId: crypto.randomUUID(), expectedRevisionId: sourceHead, expectedClientId: scope, subject, previewText: 'Saved successor preview' }, read, testEmailRenderer, transaction, (_id, client) => read(client))).revisionId
    source = next
  }
  beforeAll(async () => {
    if (!socket) return
    if (socket !== '/private/tmp/figflow-postgres-20261102-recovered') throw new Error('Assigned disposable cluster required')
    admin = new pg.Client(config())
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`)
    await admin.query(`
      CREATE TABLE agency_clients(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
      CREATE TABLE edm_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,name text,folder_name text,created_by uuid,body_source jsonb,body_html text,subject text,preview_text text,template_kind text DEFAULT 'draft',updated_at timestamptz DEFAULT now());
      CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,blocks jsonb,name text,description text,category text,preview_tone text,created_by uuid,updated_at timestamptz DEFAULT now());
      CREATE TABLE banner_assets(id uuid PRIMARY KEY,client_id uuid,uploaded_by uuid,r2_key text,url text,mime_type text,file_size integer);
      CREATE TABLE campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,name text,subject text,preview_text text,from_name text,from_email text,reply_to text,filter_rules jsonb,template_id uuid,status text DEFAULT 'draft',body_source jsonb,body_html text,scheduled_at timestamptz,created_by uuid,content_type text DEFAULT 'builder',sent integer DEFAULT 0,to_send integer DEFAULT 0,updated_at timestamptz DEFAULT now());
      CREATE TABLE email_lists(id uuid PRIMARY KEY,client_id uuid,name text,archived_at timestamptz);
      CREATE TABLE campaign_lists(campaign_id uuid REFERENCES campaigns(id),list_id uuid REFERENCES email_lists(id),PRIMARY KEY(campaign_id,list_id));
    `)
    const migrations = ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '493_email_design_handoffs.sql', '494_email_merge_tag_definitions.sql', '495_email_asset_publication.sql', '496_email_content_conditions.sql', ...(withReview ? ['497_email_review_workflow.sql'] : []), '498_email_campaign_design_projection.sql', '499_email_template_successor_projection.sql']
    for (let repeat = 0; repeat < 2; repeat++) for (const file of migrations) await admin.query(fs.readFileSync(`server/database/migrations/${file}`, 'utf8'))
    await admin.query('INSERT INTO agency_clients(id) VALUES($1),($2)', [scope, otherScope])
  })
  beforeEach(async () => {
    if (!socket) return
    vi.stubEnv('FIGFLOW_EDM_WORKFLOW_ENABLED', withReview ? 'true' : 'false')
    deniedRead = deniedPublisher = badBytes = false
    actorId = crypto.randomUUID()
    sourceTemplate = crypto.randomUUID()
    await admin.query('INSERT INTO edm_templates(id,client_id,name,body_source,body_html,subject,preview_text) VALUES($1,$2,$3,$4,$5,$6,$7)', [sourceTemplate, scope, 'Working source', structuredDesign().blocks, 'Legacy source', 'Original subject', 'Original preview'])
    const baseline = await ensureLegacyDesignDocument({ kind: 'template', ownerId: sourceTemplate, actorId }, read, transaction)
    sourceDocument = baseline.documentId
    source = validateEmailDesign(structuredDesign())
    source.policy.designerLocks = { blockIds: ['cta'], styleFields: ['heading.data.style.color'] }
    sourceHead = (await saveTemplateDesignDraft({ documentId: sourceDocument, actorId, operationId: crypto.randomUUID(), expectedRevisionId: baseline.revisionId, design: source }, read, testEmailRenderer, transaction)).revisionId
    assetId = crypto.randomUUID()
    await admin.query('INSERT INTO banner_assets VALUES($1,$2,$3,$4,$5,$6,$7,NULL)', [assetId, scope, actorId, `banner-assets/${actorId}/${assetId}/image.png`, await storage.url(assetId), 'image/png', bytes.length])
    await publishDesignLibraryAsset({ version: 1, operationId: crypto.randomUUID(), assetId }, actorId, publisher, storage, transaction)
    const module = await executeDesignModules({ version: 1, command: 'publish-module', operationId: crypto.randomUUID(), draftId: sourceDocument, expectedDraftRevisionId: sourceHead, name: 'Pinned section', description: null, category: 'Offers', previewTone: 'light', rootBlockIds: ['heading'], includedOverridePaths: [] }, authority(), testEmailRenderer, storage, transaction)
    moduleId = module.moduleId!
    moduleRevision = module.revisionId
    sourceHead = (await executeDesignModules({ version: 1, command: 'insert-module', operationId: crypto.randomUUID(), draftId: sourceDocument, expectedDraftRevisionId: sourceHead, moduleId, revisionId: moduleRevision, parentId: 'root', index: 1 }, authority(), testEmailRenderer, storage, transaction)).revisionId
    sourceHead = (await executeDesignModules({ version: 1, command: 'insert-published-image', operationId: crypto.randomUUID(), draftId: sourceDocument, expectedDraftRevisionId: sourceHead, assetId, parentId: 'root', index: 2 }, authority(), testEmailRenderer, storage, transaction)).revisionId
    const published = await publish({ version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId: sourceDocument, expectedRevisionId: sourceHead, name: 'Published R1', category: 'Offers', includedOverridePaths: [] })
    target = { templateId: published.templateId!, documentId: published.documentId, revisionId: published.revisionId }
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
  afterAll(async () => {
    if (!admin) return
    try {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      expect((await admin.query('SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1', [schema])).rows[0].n).toBe(0)
      cleanups.push(schema)
      fs.mkdirSync('.verification/template-successor-review-fixes-20261103', { recursive: true })
      fs.writeFileSync('.verification/template-successor-review-fixes-20261103/cleanup.json', JSON.stringify({ droppedSchemas: cleanups, verifiedAbsent: true, scope: 'Only run-owned disposable schemas' }, null, 2))
    } finally {
      await admin.end()
    }
  })
  databaseTest('replays a lost committed successor before and after later target/source heads without recompiling', async () => {
    await saveSource('R2 source')
    const input = request()
    const lost: DesignTransaction = async (callback) => {
      await transaction(callback)
      throw new Error('committed reply lost')
    }
    await expect(publish(input, lost)).rejects.toThrow('committed reply lost')
    const failRenderer = { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('replay must not compile')
    } }
    const r2 = await publish(input, transaction, failRenderer)
    await saveSource('R3 source')
    const r3 = await publish(request(crypto.randomUUID(), r2.revisionId))
    const before = await snapshot()
    badBytes = true
    expect(await publish(input, transaction, failRenderer)).toEqual(r2)
    expect((await owner()).email_design_revision_id).toBe(r3.revisionId)
    expect(await snapshot()).toEqual(before)
    await expect(publish({ ...input, name: 'Changed receipt payload' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    const { templateId: _target, expectedTemplateRevisionId: _targetHead, ...legacyPublish } = input
    await expect(publish({ ...legacyPublish, command: 'publish-template' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    deniedRead = true
    await expect(publish(input)).rejects.toThrow('read denied')
    deniedRead = false
    deniedPublisher = true
    await expect(publish(input)).rejects.toThrow('publisher denied')
    expect(await snapshot()).toEqual(before)
  })
  databaseTest('refuses exact source/target CAS and namespace reuse without a revision or projection effect', async () => {
    await saveSource('Saved source')
    const before = await snapshot()
    await expect(publish({ ...request(), expectedRevisionId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    await expect(publish({ ...request(), expectedTemplateRevisionId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    const op = crypto.randomUUID()
    await publishDesignLibraryAsset({ version: 1, operationId: op, assetId }, actorId, publisher, storage, transaction)
    const afterAssetReceipt = await snapshot()
    await expect(publish(request(op))).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(await snapshot()).toEqual(afterAssetReceipt)
    expect(afterAssetReceipt.owner).toEqual(before.owner)
  })
  databaseTest('requires both scopes and fresh publisher/read authority before and after asynchronous compilation', async () => {
    await saveSource('Saved source')
    const before = await snapshot()
    deniedPublisher = true
    await expect(publish(request())).rejects.toThrow('publisher denied')
    deniedPublisher = false
    deniedRead = true
    await expect(publish(request())).rejects.toThrow('read denied')
    deniedRead = false
    const revokeRead = { ...testEmailRenderer, renderDocument: async (...args: Parameters<typeof testEmailRenderer.renderDocument>) => {
      const html = await testEmailRenderer.renderDocument(...args)
      deniedRead = true
      return html
    } }
    await expect(publish(request(), transaction, revokeRead)).rejects.toThrow('read denied')
    deniedRead = false
    const revokePublisher = { ...testEmailRenderer, renderDocument: async (...args: Parameters<typeof testEmailRenderer.renderDocument>) => {
      const html = await testEmailRenderer.renderDocument(...args)
      deniedPublisher = true
      return html
    } }
    await expect(publish(request(), transaction, revokePublisher)).rejects.toThrow('publisher denied')
    deniedPublisher = false
    expect(await snapshot()).toEqual(before)
  })
  databaseTest('refuses wrong-scope targets even when the actor has independent access to both scopes', async () => {
    const other = crypto.randomUUID()
    await admin.query('INSERT INTO edm_templates(id,client_id,name,body_source,body_html,template_kind) VALUES($1,$2,$3,$4,$5,$6)', [other, otherScope, 'Other scope owner', structuredDesign().blocks, 'Legacy other', 'draft'])
    const allow = async () => {}
    const base = await ensureLegacyDesignDocument({ kind: 'template', ownerId: other, actorId }, allow, transaction)
    const design = validateEmailDesign({ ...structuredDesign(), scope: { clientId: otherScope } })
    const saved = await saveTemplateDesignDraft({ documentId: base.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: base.revisionId, design }, allow, testEmailRenderer, transaction)
    const foreign = await executeDesignTemplates({ version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId: base.documentId, expectedRevisionId: saved.revisionId, name: 'Other published', category: null, includedOverridePaths: [] }, { actorId, read: allow, designer: allow, publisher: allow }, testEmailRenderer, undefined, transaction)
    const before = await snapshot()
    await expect(publish({ ...request(), templateId: foreign.templateId, expectedTemplateRevisionId: foreign.revisionId }, transaction, testEmailRenderer, { actorId, read: allow, designer: allow, publisher: allow })).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' })
    expect(await snapshot()).toEqual(before)
  })
  databaseTest('independently rechecks target publication and never accepts designer-only authority', async () => {
    const before = await snapshot()
    let reads = 0, publishers = 0
    const targetDenied: ModuleAuthority = { actorId, read: async (client) => {
      await read(client)
      reads++
    }, designer: read, publisher: async (client) => {
      await publisher(client)
      if (++publishers === 2) throw new Error('target publisher denied')
    } }
    await expect(publish(request(), transaction, testEmailRenderer, targetDenied)).rejects.toThrow('target publisher denied')
    expect(reads).toBe(2)
    expect(publishers).toBe(2)
    await expect(publish(request(), transaction, testEmailRenderer, { ...authority(), publisher: async () => {
      throw new Error('ordinary staff has no publisher capability')
    } })).rejects.toThrow('no publisher capability')
    expect(await snapshot()).toEqual(before)
  })
  databaseTest('rejects unresolved assets, compilation and receipt failures atomically', async () => {
    await saveSource('Saved source')
    const before = await snapshot()
    badBytes = true
    await expect(publish(request())).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    badBytes = false
    await expect(publish(request(), transaction, { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('compile failed')
    } })).rejects.toThrow('compile failed')
    await expect(publish(request(), transaction, { ...testEmailRenderer, renderDocument: async () => '<img src="https://external.example/unregistered.png">' })).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    await admin.query(`CREATE FUNCTION refuse_successor_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt write failed'; END $$;
      CREATE TRIGGER refuse_successor_receipt BEFORE INSERT ON email_design_revision_receipts FOR EACH ROW EXECUTE FUNCTION refuse_successor_receipt()`)
    try {
      await expect(publish(request())).rejects.toThrow('receipt write failed')
    } finally {
      await admin.query('DROP TRIGGER refuse_successor_receipt ON email_design_revision_receipts; DROP FUNCTION refuse_successor_receipt()')
    }
    expect(await snapshot()).toEqual(before)
  })
  databaseTest('serializes competing and identical target-head publications through existing locks and receipts', async () => {
    await saveSource('Concurrent source')
    const competing = concurrentTransactions()
    const results = await Promise.allSettled([publish(request(), competing), publish(request(), competing)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'REVISION_CONFLICT' })
    const winner = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof publish>>>
    const identical = request(crypto.randomUUID(), winner.value.revisionId)
    const duplicate = concurrentTransactions()
    const [first, replay] = await Promise.all([publish(identical, duplicate), publish(identical, duplicate)])
    expect(replay).toEqual(first)
    expect((await admin.query('SELECT count(*)::int AS n FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, identical.operationId])).rows[0].n).toBe(1)
  })
  databaseTest('requires reviewed local override paths and preserves their exact canonical values', async () => {
    const current = await getDesignDraft(sourceDocument, read, admin)
    if (current.state !== 'structured') throw new Error('structured source required')
    const next = validateEmailDesign(current.source)
    const localId = next.moduleInstances[0].rootBlockIds[0]
    next.blocks[localId].data.props!.text = 'Reviewed local campaign wording'
    sourceHead = (await saveTemplateDesignDraft({ documentId: sourceDocument, actorId, operationId: crypto.randomUUID(), expectedRevisionId: sourceHead, design: next }, read, testEmailRenderer, transaction, { authorizeModuleRead: (_id, client) => read(client) })).revisionId
    const before = await snapshot()
    await expect(publish(request())).rejects.toMatchObject({ code: 'LOCAL_OVERRIDE_REVIEW_REQUIRED' })
    expect(await snapshot()).toEqual(before)
    const path = `${localId}.data.props.text`
    const revised = await publish({ ...request(), includedOverridePaths: [path] })
    expect((await readImmutableDesignTemplate(target.templateId, revised.revisionId, authority(), admin)).design.blocks[localId].data.props!.text).toBe('Reviewed local campaign wording')
  })
  databaseTest('publishes a saved edited campaign source without altering its content or base pin, and replays after freeze', async () => {
    const campaign = await createCampaignFromTemplateRevision({ version: 1, command: 'create-from-template', operationId: crypto.randomUUID(), templateId: target.templateId, revisionId: target.revisionId, clientId: scope, campaign: { name: 'Campaign source' } }, { actorId, read, write: read }, testEmailRenderer, storage, transaction)
    const initial = await getDesignDraft(campaign.documentId, read, admin)
    if (initial.state !== 'structured') throw new Error('structured campaign required')
    const edited = validateEmailDesign(initial.source)
    edited.blocks.heading.data.props!.text = 'Campaign-specific published source'
    const saved = await saveCampaignDesignDraft({ documentId: campaign.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: campaign.revisionId, design: edited, subject: 'Campaign source subject', previewText: 'Campaign source preview' }, read, testEmailRenderer, transaction,
      { authorizeModuleRead: (_id, client) => read(client), authorizeTemplateRead: (_id, client) => read(client) })
    const before = await getDesignDraft(campaign.documentId, read, admin)
    const input = { ...request(), draftId: campaign.documentId, expectedRevisionId: saved.revisionId }
    const revised = await publish(input)
    expect(revised.templateId).toBe(target.templateId)
    const selected = await readImmutableDesignTemplate(target.templateId, revised.revisionId, authority(), admin)
    expect(selected.design).toEqual({ ...edited, kind: 'template' })
    expect(selected).toMatchObject({ subject: 'Campaign source subject', previewText: 'Campaign source preview' })
    expect(await getDesignDraft(campaign.documentId, read, admin)).toEqual(before)
    if (withReview) {
      const reviewTarget = await loadReviewTarget(admin, 'campaign', campaign.campaignId, false)
      const review = { actorId, operationId: crypto.randomUUID(), kind: 'campaign' as const, targetId: campaign.campaignId, expectedClientId: scope, expectedVersion: 0, expectedContentDigest: reviewTarget!.digest, payload: { command: 'submit' as const } }
      const deps = { transaction: transaction as never, readDb: admin, readReceipt: async () => null, designStorage: storage }
      const submitted = await runReviewCommand(review, async (_access, client) => read(client), deps)
      await runReviewCommand({ ...review, actorId: crypto.randomUUID(), operationId: crypto.randomUUID(), expectedVersion: submitted.version, payload: { command: 'approve' } }, async (_access, client) => read(client), deps)
    }
    await admin.query('UPDATE campaigns SET status=\'sent\' WHERE id=$1', [campaign.campaignId])
    expect(await publish(input)).toEqual(revised)
    await expect(publish({ ...input, operationId: crypto.randomUUID(), expectedTemplateRevisionId: revised.revisionId })).rejects.toMatchObject({ code: 'CAMPAIGN_FROZEN' })
  })
  databaseTest('serializes different working owners targeting the same published head without lock-order inversion', async () => {
    const copy = await publish({ version: 1, command: 'copy-template-draft', operationId: crypto.randomUUID(), templateId: target.templateId, revisionId: target.revisionId, expectedSourceHeadRevisionId: target.revisionId, clientId: scope, name: 'Other working source', category: null })
    const locks: string[][] = []
    const concurrent = concurrentTransactions()
    const observed: DesignTransaction = callback => concurrent(async (db) => {
      const acquired: string[] = []
      locks.push(acquired)
      return callback({ query: async (sql, params) => {
        if (sql.includes('FOR UPDATE') && /FROM (?:edm_templates|campaigns) /.test(sql)) acquired.push(`owner:${params![0]}`)
        if (sql.includes('FOR UPDATE') && sql.includes('FROM email_design_documents ')) acquired.push(`document:${params![0]}`)
        return db.query(sql, params)
      } })
    })
    const results = await Promise.allSettled([publish(request(), observed), publish({ ...request(), draftId: copy.documentId, expectedRevisionId: copy.revisionId }, observed)])
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(row => row.status === 'rejected')).toHaveLength(1)
    expect((results.find(row => row.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'REVISION_CONFLICT' })
    for (const acquired of locks) {
      expect(acquired.slice(0, 2).every(value => value.startsWith('owner:'))).toBe(true)
      expect(acquired.slice(2, 4).every(value => value.startsWith('document:'))).toBe(true)
      expect(acquired.slice(0, 2)).toEqual([...acquired.slice(0, 2)].sort())
    }
  })
  databaseTest('published owners remain unavailable to generic template draft/staff saves or source promotion', async () => {
    const published = await readImmutableDesignTemplate(target.templateId, target.revisionId, authority(), admin)
    const before = await snapshot()
    for (const save of [saveTemplateDesignDraft, saveStaffTemplateDesignDraft])
      await expect(save({ documentId: target.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: target.revisionId, design: published.design }, read, testEmailRenderer, transaction, { authorizeModuleRead: (_id, client) => read(client) })).rejects.toMatchObject({ code: 'TEMPLATE_DRAFT_REQUIRED' })
    await expect(publish({ ...request(), templateId: sourceTemplate, expectedTemplateRevisionId: sourceHead })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(publish({ ...request(), draftId: target.documentId, expectedRevisionId: target.revisionId })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await snapshot()).toEqual(before)
  })
  for (const change of ['body_html=\'raw html\'', 'subject=\'raw subject\'', 'template_kind=\'draft\'', 'email_design_revision_id=NULL']) {
    databaseTest(`refuses raw published projection change ${change}`, async () => {
      const revised = await publish(request())
      const before = await snapshot()
      await expect(transaction(db => db.query(`UPDATE edm_templates SET ${change} WHERE id=$1`, [target.templateId]))).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
      expect((await owner()).email_design_revision_id).toBe(revised.revisionId)
      expect(await snapshot()).toEqual(before)
    })
  }
  databaseTest('rejects forged published HTML hashes and publication metadata on a working owner', async () => {
    const before = await snapshot()
    const current = await getDesignDraft(sourceDocument, read, admin)
    if (current.state !== 'structured') throw new Error('structured source required')
    await expect(transaction(db => db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,subject,preview_text,template_rendered_html_sha256)
      VALUES($1,$2,1,$3,$4,$5,$6,$7)`, [sourceDocument, sourceHead, JSON.stringify(current.source), actorId, 'Original subject', 'Original preview', '0'.repeat(64)]))).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
    await expect(transaction(async (db) => {
      const revision = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,subject,preview_text,template_rendered_html_sha256)
        VALUES($1,$2,1,$3,$4,$5,$6,$7) RETURNING id`, [target.documentId, target.revisionId, JSON.stringify(current.source), actorId, 'Original subject', 'Original preview', '0'.repeat(64)])).rows[0] as { id: string }
      await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [target.documentId, revision.id])
      await db.query('UPDATE edm_templates SET body_html=\'forged HTML\',email_design_revision_id=$2 WHERE id=$1', [target.templateId, revision.id])
    })).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
    expect(await snapshot()).toEqual(before)
  })
  databaseTest('preserves schema-0 legacy editing but refuses a published schema-1 downgrade', async () => {
    const legacy = crypto.randomUUID()
    await admin.query('INSERT INTO edm_templates(id,client_id,name,body_source,body_html,template_kind) VALUES($1,$2,$3,$4,$5,$6)', [legacy, scope, 'Legacy library', structuredDesign().blocks, 'Old legacy HTML', 'template'])
    await ensureLegacyDesignDocument({ kind: 'template', ownerId: legacy, actorId }, read, transaction)
    await admin.query('UPDATE edm_templates SET body_html=\'Edited legacy HTML\' WHERE id=$1', [legacy])
    expect((await admin.query('SELECT body_html FROM edm_templates WHERE id=$1', [legacy])).rows[0].body_html).toBe('Edited legacy HTML')
    const before = await snapshot()
    await expect(transaction(async (db) => {
      const row = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,origin,payload_text,created_by)
        VALUES($1,$2,0,'legacy','{}',$3) RETURNING id`, [target.documentId, target.revisionId, actorId])).rows[0] as { id: string }
      await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [target.documentId, row.id])
    })).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
    expect(await snapshot()).toEqual(before)
  })
  for (const startingHead of ['bootstrap R1', 'hashed R2']) {
    databaseTest(`existing metadata owner renames and re-folders ${startingHead} without touching canonical output or pins`, async () => {
      const head = startingHead === 'hashed R2' ? (await publish(request())).revisionId : target.revisionId
      const campaign = await createCampaignFromTemplateRevision({ version: 1, command: 'create-from-template', operationId: crypto.randomUUID(), templateId: target.templateId, revisionId: head, clientId: scope, campaign: { name: 'Pinned before label change' } }, { actorId, read, write: read }, testEmailRenderer, storage, transaction)
      const before = await snapshot()
      const revisionsBefore = (await admin.query('SELECT * FROM email_design_revisions ORDER BY id')).rows
      const query = async <T>(sql: string, params?: unknown[]) => (await admin.query(sql, params)).rows[0] as T ?? null
      vi.spyOn(templateDb, 'queryOneFresh').mockImplementation(query)
      vi.spyOn(templateDb, 'queryOne').mockImplementation(query)
      const mustNotRender = { ...testEmailRenderer, renderDocument: async () => {
        throw new Error('label-only patch must not compile')
      } }
      expect(await updateTemplate(target.templateId, { name: 'Library label', folder_name: '  Seasonal  ' }, mustNotRender, scope)).toMatchObject({ name: 'Library label', folder_name: 'Seasonal' })
      expect(await updateTemplate(target.templateId, { folder_name: null }, mustNotRender, scope)).toMatchObject({ name: 'Library label', folder_name: null })
      expect(await updateTemplate(target.templateId, { name: 'Wrong scope' }, mustNotRender, otherScope)).toBeNull()
      const after = await snapshot()
      expect(after.owner).toEqual({ ...before.owner, name: 'Library label', folder_name: null, updated_at: after.owner.updated_at })
      expect(after.documents).toEqual(before.documents)
      expect(after.revisions).toEqual(before.revisions)
      expect(after.receipts).toEqual(before.receipts)
      expect(after.campaigns).toEqual(before.campaigns)
      expect((await admin.query('SELECT * FROM email_design_revisions ORDER BY id')).rows).toEqual(revisionsBefore)
      expect(await getDesignDraft(campaign.documentId, read, admin)).toMatchObject({ baseTemplateRevisionId: head })
      const unchanged = await snapshot()
      await expect(updateTemplate(target.templateId, { name: 'Mixed forbidden', subject: 'Changed subject' }, testEmailRenderer, scope)).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
      await expect(updateTemplate(target.templateId, { name: 'Mixed scope', client_id: otherScope }, testEmailRenderer, scope)).rejects.toMatchObject({ code: '55000' })
      await expect(admin.query('UPDATE edm_templates SET name=$2,body_html=$3 WHERE id=$1', [target.templateId, 'Raw mixed', 'Changed HTML'])).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
      await expect(admin.query('UPDATE edm_templates SET name=$2,email_design_revision_id=$3 WHERE id=$1', [target.templateId, 'Raw mixed pointer', sourceHead])).rejects.toMatchObject({ code: '55000' })
      expect(await snapshot()).toEqual(unchanged)
    })
  }
  for (const startingHead of ['bootstrap R1', 'hashed R2']) {
    databaseTest(`refuses legacy descendants mimicking the initial publication bootstrap from ${startingHead}`, async () => {
      const head = startingHead === 'hashed R2' ? (await publish(request())).revisionId : target.revisionId
      const before = await snapshot()
      const saved = await readImmutableDesignTemplate(target.templateId, head, authority(), admin)
      await expect(transaction(async (db) => {
        const first = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,origin,payload_text,created_by)
          VALUES($1,$2,0,'legacy',$3,$4) RETURNING id`, [target.documentId, head, JSON.stringify({ body_source: before.owner.body_source, body_html: before.owner.body_html }), actorId])).rows[0] as { id: string }
        await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [target.documentId, first.id])
        const second = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,origin,payload_text,created_by,subject,preview_text)
          VALUES($1,$2,0,'legacy',$3,$4,$5,$6) RETURNING id`, [target.documentId, first.id, JSON.stringify(saved.design), actorId, before.owner.subject, before.owner.preview_text])).rows[0] as { id: string }
        await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [target.documentId, second.id])
      })).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
      expect(await snapshot()).toEqual(before)
    })
  }
  databaseTest('refuses rewinding a published structured history to its legacy root or a missing head', async () => {
    const before = await snapshot()
    const root = (await admin.query('SELECT id FROM email_design_revisions WHERE document_id=$1 AND parent_revision_id IS NULL', [target.documentId])).rows[0].id
    for (const head of [root, null]) {
      await expect(transaction(db => db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [target.documentId, head]))).rejects.toMatchObject({ code: '55000', message: 'Email design head must advance to its successor' })
      expect(await snapshot()).toEqual(before)
    }
  })
  for (const startingHead of ['bootstrap R1', 'hashed R2']) for (const order of ['head first', 'owner first']) {
    databaseTest(`refuses compound legacy downgrade and owner demotion from ${startingHead}, ${order}`, async () => {
      const head = startingHead === 'hashed R2' ? (await publish(request())).revisionId : target.revisionId
      const before = await snapshot()
      const immutableBefore = (await admin.query('SELECT * FROM email_design_revisions ORDER BY id')).rows
      await expect(transaction(async (db) => {
        const legacy = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,origin,payload_text,created_by)
          VALUES($1,$2,0,'legacy','{}',$3) RETURNING id`, [target.documentId, head, actorId])).rows[0] as { id: string }
        const demote = () => db.query(`UPDATE edm_templates SET template_kind='draft',email_design_revision_id=NULL,
          body_source='{"changed":true}'::jsonb,body_html='<p>Changed projection</p>',subject='Changed subject',preview_text='Changed preview'
          WHERE id=$1`, [target.templateId])
        if (order === 'owner first') await demote()
        await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [target.documentId, legacy.id])
        if (order === 'head first') await demote()
      })).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
      expect(await snapshot()).toEqual(before)
      expect((await admin.query('SELECT * FROM email_design_revisions ORDER BY id')).rows).toEqual(immutableBefore)
    })
  }
  databaseTest('refuses raw head-only successors, cross-owner pointers, head rewind and kind promotion', async () => {
    const before = await snapshot()
    const current = await getDesignDraft(sourceDocument, read, admin)
    if (current.state !== 'structured') throw new Error('structured source required')
    await expect(transaction(db => appendModuleOrDraft(db, target.documentId, target.revisionId, current.source, actorId, 'Original subject', 'Original preview'))).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
    await expect(transaction(db => db.query('UPDATE edm_templates SET email_design_revision_id=$2 WHERE id=$1', [target.templateId, sourceHead]))).rejects.toMatchObject({ code: '55000' })
    await expect(transaction(db => db.query('UPDATE edm_templates SET template_kind=\'template\' WHERE id=$1', [sourceTemplate]))).rejects.toMatchObject({ code: '55000' })
    expect(await snapshot()).toEqual(before)
    const revised = await publish(request())
    const afterPublication = await snapshot()
    await expect(transaction(db => db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [target.documentId, target.revisionId]))).rejects.toMatchObject({ code: '55000' })
    expect((await owner()).email_design_revision_id).toBe(revised.revisionId)
    expect(await snapshot()).toEqual(afterPublication)
  })
  databaseTest('publishes actual same T/R2 while A/B retain immutable R1 pins and new C selects R2', async () => {
    const r1 = await readImmutableDesignTemplate(target.templateId, target.revisionId, authority(), admin)
    const create = (name: string, revisionId: string) => createCampaignFromTemplateRevision({ version: 1, command: 'create-from-template', operationId: crypto.randomUUID(), templateId: target.templateId, revisionId, clientId: scope, campaign: { name } }, { actorId, read, write: read }, testEmailRenderer, storage, transaction)
    const a = await create('A', target.revisionId), b = await create('B', target.revisionId)
    const beforeCampaigns = (await snapshot()).campaigns
    await saveSource('Source R2')
    const sourceBefore = await getDesignDraft(sourceDocument, read, admin)
    const revised = await publish(request())
    expect(revised).toMatchObject({ published: true, templateId: target.templateId, documentId: target.documentId })
    expect(revised.revisionId).not.toBe(target.revisionId)
    expect(await owner()).toMatchObject({ template_kind: 'template', email_design_revision_id: revised.revisionId, subject: 'Saved successor subject', preview_text: 'Saved successor preview', body_source: source.blocks })
    expect((await admin.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1', [target.documentId])).rows[0].head_revision_id).toBe(revised.revisionId)
    expect(await readImmutableDesignTemplate(target.templateId, target.revisionId, authority(), admin)).toMatchObject({ design: r1.design })
    expect((await snapshot()).campaigns).toEqual(beforeCampaigns)
    for (const campaign of [a, b]) expect(await getDesignDraft(campaign.documentId, read, admin)).toMatchObject({ baseTemplateRevisionId: target.revisionId, source: { dependencies: [{ moduleId, revisionId: moduleRevision }], moduleInstances: r1.design.moduleInstances, assets: r1.design.assets, policy: r1.design.policy, lineage: r1.design.lineage } })
    const newerModule = await executeDesignModules({ version: 1, command: 'revise-module', operationId: crypto.randomUUID(), draftId: sourceDocument, expectedDraftRevisionId: sourceHead, moduleId, expectedModuleRevisionId: moduleRevision, name: 'New module head', description: null, category: 'Offers', previewTone: 'light', rootBlockIds: ['heading'], includedOverridePaths: [] }, authority(), testEmailRenderer, storage, transaction)
    expect(newerModule.revisionId).not.toBe(moduleRevision)
    expect((await snapshot()).campaigns).toEqual(beforeCampaigns)
    const c = await create('C', revised.revisionId)
    expect(await getDesignDraft(c.documentId, read, admin)).toMatchObject({ baseTemplateRevisionId: revised.revisionId, source: { blocks: source.blocks, policy: source.policy, assets: source.assets } })
    expect(await getDesignDraft(sourceDocument, read, admin)).toEqual(sourceBefore)
  })
})
