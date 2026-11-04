import fs from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { executeDesignTemplates, readImmutableDesignTemplate } from '../../server/utils/email-marketing/designTemplates'
import { executeDesignHistory } from '../../server/utils/email-marketing/designHistory'
import { publishDesignLibraryAsset } from '../../server/utils/email-marketing/designLibraryOperations'
import { appendModuleOrDraft, executeDesignModules, lockDraft, renderDraft, type ModuleAuthority } from '../../server/utils/email-marketing/designModules'
import { ensureLegacyDesignDocument, saveTemplateDesignDraft, type DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { getTemplateDesignDraft } from '../../server/utils/email-marketing/designReads'
import type { DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import { validateEmailDesign, type EmailDesignDocument } from '../../shared/emailRendering/designContract'
import type { DesignHistoryRequest } from '../../shared/emailRendering/designHistory'
import { structuredDesign } from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'

// Never use DATABASE_URL, runtime config, or customer rows. Each connection has
// only this run's schema in its search_path, including the real migration SQL.
const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const databaseTest = socket ? it : it.skip
const schema = `figflow_library_history_${Date.now()}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
const config = () => ({ host: socket, port: 55483, user: 'figflow_test', database: 'figflow_design_test', connectionTimeoutMillis: 5000 })
const scope = structuredDesign().scope.clientId
const originalSubject = 'Synthetic offer {{first_name}}'
const originalPreview = 'Synthetic original preview'
let admin: pg.Client | undefined
let actorId: string
let templateId: string
let documentId: string
let head: string
let design: EmailDesignDocument
let revoked: boolean
let migrationsApplied = 0

const transaction: DesignTransaction = async (callback) => {
  const db = new pg.Client(config())
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query(`SET LOCAL search_path TO ${schema}`)
    await db.query('SET LOCAL statement_timeout = \'10s\'; SET LOCAL lock_timeout = \'5s\'')
    const result = await callback(db)
    await db.query('COMMIT') // Exercises deferred committed-head constraints too.
    return result
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally { await db.end() }
}
// Both connections must begin before either command runs, rather than relying
// on Promise scheduling alone to make a supposed race overlap.
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
const authorize = async (clientId: string | null) => {
  if (revoked || clientId !== scope) throw new Error('synthetic authority denied')
}
const authority = (): ModuleAuthority => ({ actorId, read: authorize, designer: authorize, publisher: authorize })
const templates = (request: unknown, storage?: DesignAssetStorage) => executeDesignTemplates(request, authority(), testEmailRenderer, storage, transaction)
const history = (request: DesignHistoryRequest, tx = transaction) => executeDesignHistory(request, authority(), testEmailRenderer, undefined, tx)
const restore = (expectedRevisionId = head): Extract<DesignHistoryRequest, { command: 'restore-revision' }> => ({
  version: 1, command: 'restore-revision', draftId: documentId, expectedRevisionId, revisionId: head, operationId: crypto.randomUUID()
})
async function currentDesign() {
  const current = await getTemplateDesignDraft(documentId, authorize, admin!)
  if (current.state !== 'structured') throw new Error('Expected structured draft')
  return current
}
async function snapshots() {
  return (await admin!.query('SELECT * FROM email_design_revisions WHERE document_id=$1 ORDER BY id', [documentId])).rows
}
async function counts() {
  return (await admin!.query(`SELECT
    (SELECT count(*)::int FROM email_design_revisions WHERE document_id=$1) AS revisions,
    (SELECT count(*)::int FROM email_design_revision_receipts WHERE document_id=$1) AS receipts`, [documentId])).rows[0]
}
// Fixture-only successor creation uses the real append helper and projection
// trigger, so historical/current metadata can deliberately differ without ever
// editing an immutable snapshot or disabling a trigger.
async function successor(next: EmailDesignDocument, subject: string, preview: string) {
  return transaction(async (db) => {
    await lockDraft(db, documentId)
    const current = await getTemplateDesignDraft(documentId, authorize, db)
    const html = await renderDraft(testEmailRenderer, next, subject, preview)
    const id = await appendModuleOrDraft(db, documentId, current.headRevisionId, next, actorId, subject, preview)
    await db.query('UPDATE edm_templates SET subject=$2,preview_text=$3,body_source=$4::jsonb,body_html=$5,email_design_revision_id=$6 WHERE id=$1', [templateId, subject, preview, JSON.stringify(next.blocks), html, id])
    return id
  })
}
async function registeredAsset() {
  const assetId = crypto.randomUUID()
  const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64'))
  const key = `banner-assets/${actorId}/${crypto.randomUUID()}/image.png`
  const url = `https://example.invalid/registered/${assetId}`
  await admin!.query('INSERT INTO banner_assets(id,client_id,uploaded_by,r2_key,url,mime_type,file_size) VALUES($1,$2,$3,$4,$5,$6,$7)', [assetId, scope, actorId, key, url, 'image/png', bytes.length])
  const storage: DesignAssetStorage = {
    read: async (requested) => {
      expect(requested).toBe(key)
      return bytes
    },
    url: async (requested) => {
      expect(requested).toBe(assetId)
      return url
    },
    identifyUrl: async value => value === url ? assetId : null
  }
  const request = { version: 1 as const, operationId: crypto.randomUUID(), assetId }
  return { request, storage, url, publish: (operationId = request.operationId) => publishDesignLibraryAsset({ ...request, operationId }, actorId, authorize, storage, transaction) }
}

describe('canonical library/history with isolated real PostgreSQL', () => {
  beforeAll(async () => {
    if (!socket) return
    if (socket !== '/private/tmp/figflow-postgres-20261102-recovered') throw new Error('Requires the explicitly assigned disposable PostgreSQL fixture')
    admin = new pg.Client(config())
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`)
    // Include the actual owner columns used by library publication, rather than
    // letting a SQL mock overlook missing defaults/name/folder/created_by.
    await admin.query(`
      CREATE TABLE agency_clients(id uuid PRIMARY KEY);
      CREATE TABLE edm_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, name text, folder_name text, created_by uuid, body_source jsonb, body_html text, subject text, preview_text text, template_kind text DEFAULT 'draft', updated_at timestamptz DEFAULT now());
      CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, blocks jsonb, name text, description text, category text, preview_tone text, created_by uuid, updated_at timestamptz DEFAULT now());
      CREATE TABLE banner_assets(id uuid PRIMARY KEY, client_id uuid, uploaded_by uuid, r2_key text, url text, mime_type text, file_size integer);
      CREATE TABLE campaigns(id uuid PRIMARY KEY, client_id uuid, status text);
    `)
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const file of ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '493_email_design_handoffs.sql', '494_email_merge_tag_definitions.sql', '495_email_asset_publication.sql', '496_email_content_conditions.sql']) {
        await admin.query(fs.readFileSync(new URL(`../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
        migrationsApplied++
      }
    }
    await admin.query('INSERT INTO agency_clients VALUES($1)', [scope])
  })
  beforeEach(async () => {
    if (!socket) return
    revoked = false
    actorId = crypto.randomUUID()
    templateId = crypto.randomUUID()
    await admin!.query('INSERT INTO edm_templates(id,client_id,name,subject,preview_text) VALUES($1,$2,$3,$4,$5)', [templateId, scope, 'Synthetic source draft', originalSubject, originalPreview])
    const baseline = await ensureLegacyDesignDocument({ kind: 'template', ownerId: templateId, actorId }, authorize, transaction)
    documentId = baseline.documentId
    design = validateEmailDesign(structuredDesign())
    design.source.brand = { kitId: crypto.randomUUID(), versionId: crypto.randomUUID(), version: 2, name: 'Synthetic pinned brand', defaults: { primaryColor: '#123456', fontFamily: 'MODERN_SANS', contentWidth: 600, fontFallback: false, requestedFont: null } }
    design.policy.designerLocks = { blockIds: ['cta'], styleFields: [] }
    head = (await saveTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: baseline.revisionId, design }, authorize, testEmailRenderer, transaction)).revisionId
  })
  afterAll(async () => {
    if (!admin) return
    try {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      expect((await admin.query('SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1', [schema])).rows[0].count).toBe(0)
      console.info(`Dropped isolated PostgreSQL schema ${schema}; migration executions: ${migrationsApplied}`)
    } finally { await admin.end() }
  })

  databaseTest('applies migrations 491–496 twice and retains real immutable/deferred triggers', async () => {
    expect(migrationsApplied).toBe(12)
    const triggers = (await admin!.query(`SELECT tgname,tgdeferrable,tginitdeferred FROM pg_trigger
      WHERE tgrelid='email_design_revisions'::regclass AND NOT tgisinternal`)).rows
    expect(triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({ tgname: 'email_design_revision_immutable' }),
      expect.objectContaining({ tgname: 'email_design_revision_parent' }),
      expect.objectContaining({ tgname: 'email_design_committed_head', tgdeferrable: true, tginitdeferred: true })
    ]))
    expect((await admin!.query('SELECT current_schema() AS schema')).rows[0].schema).toBe(schema)
  })

  databaseTest('publishes and copies the exact immutable design, IDs, policy, old module pin, asset and metadata', async () => {
    const moduleMetadata = { name: 'Synthetic heading', category: 'test', description: null, previewTone: 'light', includedOverridePaths: [], rootBlockIds: ['heading'] }
    const module = await executeDesignModules({ version: 1, command: 'publish-module', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: head, ...moduleMetadata }, authority(), testEmailRenderer, undefined, transaction)
    const inserted = await executeDesignModules({ version: 1, command: 'insert-module', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: head, moduleId: module.moduleId, revisionId: module.revisionId, parentId: 'root', index: 1 }, authority(), testEmailRenderer, undefined, transaction)
    const selected = (await currentDesign()).source
    const asset = await registeredAsset()
    const publishedAsset = await asset.publish()
    selected.blocks.image = { type: 'Image', data: { props: { url: asset.url, alt: 'Synthetic registered image' } } }
    selected.blocks.root.data.childrenIds!.push('image')
    selected.assets = [publishedAsset.asset]
    const saved = await saveTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: inserted.revisionId, design: selected }, authorize, testEmailRenderer, transaction, { authorizeModuleRead: async (_id, clientId) => authorize(clientId) })
    // Advance the module's real head after insertion. Publication/copy must keep
    // the exact older dependency rather than silently selecting the newer head.
    const revised = await executeDesignModules({ version: 1, command: 'revise-module', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: saved.revisionId, moduleId: module.moduleId, expectedModuleRevisionId: module.revisionId, ...moduleMetadata }, authority(), testEmailRenderer, asset.storage, transaction)
    expect(revised.revisionId).not.toBe(module.revisionId)
    const before = await snapshots()
    const request = { version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: saved.revisionId, name: 'Synthetic published offer', category: 'Offers', includedOverridePaths: [] }
    const published = await templates(request, asset.storage)
    expect(await templates(request, asset.storage)).toEqual(published)
    const immutable = await readImmutableDesignTemplate(published.templateId!, published.revisionId, authority(), admin!)
    expect(immutable).toMatchObject({ subject: originalSubject, previewText: originalPreview })
    expect(immutable.design).toEqual(selected)
    expect(immutable.design.dependencies).toEqual([{ moduleId: module.moduleId, revisionId: module.revisionId }])
    const copyRequest = { version: 1, command: 'copy-template-draft', operationId: crypto.randomUUID(), templateId: published.templateId, revisionId: published.revisionId, expectedSourceHeadRevisionId: published.revisionId, name: 'Synthetic working copy', category: 'Offers', clientId: scope }
    const copied = await templates(copyRequest, asset.storage)
    expect(await templates(copyRequest, asset.storage)).toEqual(copied)
    expect(new Set([templateId, published.templateId, copied.templateId]).size).toBe(3)
    const copy = await getTemplateDesignDraft(copied.documentId, authorize, admin!)
    expect(copy).toMatchObject({ state: 'structured', headRevisionId: copied.revisionId, source: selected, projection: { state: 'current' } })
    if (copy.state !== 'structured') throw new Error('Expected structured copy')
    expect(copy.source.lineage).toEqual(selected.lineage)
    expect(copy.source.policy).toEqual(selected.policy)
    expect(copy.source.source.brand).toEqual(selected.source.brand)
    expect(copy.source.moduleInstances).toEqual(selected.moduleInstances)
    expect(copy.source.assets).toEqual([publishedAsset.asset])
    const copyRevision = (await admin!.query('SELECT subject,preview_text FROM email_design_revisions WHERE document_id=$1 AND id=$2', [copied.documentId, copied.revisionId])).rows[0]
    expect(copyRevision).toEqual({ subject: originalSubject, preview_text: originalPreview })
    const owners = (await admin!.query('SELECT id,name,folder_name,template_kind,subject,preview_text,body_source,body_html,email_design_revision_id,created_by FROM edm_templates WHERE id=ANY($1::uuid[])', [[published.templateId, copied.templateId]])).rows
    expect(owners.find(row => row.id === published.templateId)).toMatchObject({ name: request.name, template_kind: 'template', folder_name: 'Offers', subject: originalSubject, preview_text: originalPreview, body_source: selected.blocks, created_by: actorId })
    expect(owners.find(row => row.id === copied.templateId)).toMatchObject({ name: copyRequest.name, template_kind: 'draft', folder_name: 'Offers', subject: originalSubject, preview_text: originalPreview, body_source: selected.blocks, email_design_revision_id: copied.revisionId, created_by: actorId })
    expect(owners[0].body_html).toBe(owners[1].body_html)
    expect(owners[0].body_html).toContain('Synthetic registered image')
    expect(await snapshots()).toEqual(before)
    await expect(admin!.query('UPDATE edm_templates SET body_html=$2 WHERE id=$1', [published.templateId, '<p>tampered</p>'])).rejects.toMatchObject({ code: '55000', constraint: 'email_design_revision_required' })
    await expect(templates({ ...copyRequest, operationId: crypto.randomUUID(), expectedSourceHeadRevisionId: crypto.randomUUID() }, asset.storage)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  })

  databaseTest('restores as a new successor with historical metadata, immutable snapshots and a current projection', async () => {
    const changed = validateEmailDesign(design)
    changed.blocks.heading.data.props!.text = 'New current heading'
    const previous = await successor(changed, 'Synthetic newer subject', 'Synthetic newer preview')
    const before = await snapshots()
    const result = await history(restore(previous))
    if (!('documentId' in result)) throw new Error('Expected restore receipt')
    expect(result.revisionId).not.toBe(head)
    expect(result.revisionId).not.toBe(previous)
    const rows = await snapshots()
    for (const row of before) expect(rows.find(next => next.id === row.id)).toEqual(row)
    expect(rows.find(row => row.id === result.revisionId)).toMatchObject({ parent_revision_id: previous, payload: design, subject: originalSubject, preview_text: originalPreview })
    const current = await currentDesign()
    expect(current).toMatchObject({ headRevisionId: result.revisionId, source: design, projection: { state: 'current' } })
    const owner = (await admin!.query('SELECT * FROM edm_templates WHERE id=$1', [templateId])).rows[0]
    expect(owner).toMatchObject({ subject: originalSubject, preview_text: originalPreview, body_source: design.blocks, email_design_revision_id: result.revisionId })
    expect(owner.body_html).toContain('Hello')
    const list = await history({ version: 1, command: 'list-revisions', draftId: documentId })
    if (!('revisions' in list)) throw new Error('Expected history list')
    expect(list.revisions.map(row => row.id)).toEqual([result.revisionId, previous, head, before.find(row => row.parent_revision_id === null)!.id])
    await expect(admin!.query('UPDATE email_design_revisions SET subject=$2 WHERE id=$1', [head, 'tampered'])).rejects.toMatchObject({ code: '55000' })
    await expect(admin!.query('DELETE FROM email_design_revisions WHERE id=$1', [head])).rejects.toMatchObject({ code: '55000' })
    await expect(admin!.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [documentId, head])).rejects.toMatchObject({ code: '55000' })
    // The real deferred constraint rejects an orphan even if its parent is the
    // valid current head at INSERT time; failure occurs at COMMIT.
    await expect(transaction(async (db) => {
      await db.query('INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by) VALUES($1,$2,1,$3,$4)', [documentId, result.revisionId, JSON.stringify(design), actorId])
    })).rejects.toMatchObject({ code: '55000' })
    expect(await snapshots()).toEqual(rows)
  })

  databaseTest('allows only one concurrent restore from a shared head and rolls back the stale contender', async () => {
    const before = await counts()
    const requests = [restore(), restore()]
    const concurrent = concurrentTransactions()
    const outcomes = await Promise.allSettled(requests.map(request => history(request, concurrent)))
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'REVISION_CONFLICT' } })
    const winner = outcomes.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof history>>>
    if (!('documentId' in winner.value)) throw new Error('Expected restore receipt')
    expect((await currentDesign()).headRevisionId).toBe(winner.value.revisionId)
    expect(await counts()).toEqual({ revisions: before.revisions + 1, receipts: before.receipts + 1 })
    expect((await admin!.query('SELECT count(*)::int AS count FROM email_design_revisions WHERE document_id=$1 AND parent_revision_id=$2', [documentId, head])).rows[0].count).toBe(1)
    const after = await snapshots()
    await expect(history(restore())).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(await snapshots()).toEqual(after)
  })

  databaseTest('reconciles a committed restore with a lost reply after a later head without another append', async () => {
    const request = restore()
    let calls = 0
    const lostReply: DesignTransaction = async (callback) => {
      calls++
      await transaction(callback)
      throw new Error('Synthetic committed reply lost')
    }
    await expect(history(request, lostReply)).rejects.toThrow('Synthetic committed reply lost')
    expect(calls).toBe(1)
    const receipt = (await admin!.query('SELECT * FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, request.operationId])).rows[0]
    expect(receipt.document_id).toBe(documentId)
    const later = await history(restore(receipt.revision_id))
    if (!('documentId' in later)) throw new Error('Expected restore receipt')
    const before = await counts()
    const reconciled = await history(request)
    expect(reconciled).toMatchObject({ documentId, revisionId: receipt.revision_id, subject: originalSubject, previewText: originalPreview })
    expect(await history(request)).toEqual(reconciled)
    expect((await currentDesign()).headRevisionId).toBe(later.revisionId)
    expect(await counts()).toEqual(before)
    await expect(admin!.query('DELETE FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, request.operationId])).rejects.toMatchObject({ code: '55000' })
    await expect(history({ ...request, revisionId: later.revisionId })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    revoked = true
    await expect(history(request)).rejects.toThrow('synthetic authority denied')
    expect(await counts()).toEqual(before)
  })

  databaseTest('enforces current grants/brand on restore and leaves no effect when policy blocks history', async () => {
    const changed = validateEmailDesign(design)
    changed.source.brand!.version = 3
    changed.policy.editableFields = changed.policy.editableFields.filter(path => !path.startsWith('heading.'))
    // A matching heading is permitted: historic grants and brand must not return.
    const restricted = await successor(changed, originalSubject, originalPreview)
    const restored = await history(restore(restricted))
    if (!('documentId' in restored)) throw new Error('Expected restore receipt')
    expect((await currentDesign()).source).toMatchObject({ policy: changed.policy, source: changed.source })
    changed.blocks.heading.data.props!.text = 'Now protected heading'
    const locked = await successor(changed, originalSubject, originalPreview)
    const before = await snapshots(), beforeCounts = await counts()
    const preview = await history({ version: 1, command: 'preview-revision', draftId: documentId, expectedRevisionId: locked, revisionId: head })
    expect(preview).toMatchObject({ restorable: false, blockedReason: 'EDIT_FORBIDDEN' })
    await expect(history(restore(locked))).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
    expect(await snapshots()).toEqual(before)
    expect(await counts()).toEqual(beforeCounts)
    expect((await currentDesign()).headRevisionId).toBe(locked)
  })

  databaseTest('rejects cross asset/revision action reuse in both directions and serializes a concurrent collision', async () => {
    const asset = await registeredAsset()
    const assetReceipt = await asset.publish()
    expect(await asset.publish()).toEqual(assetReceipt)
    const before = await counts()
    await expect(history({ ...restore(), operationId: asset.request.operationId })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(await counts()).toEqual(before)
    const revisionRequest = restore()
    const revised = await history(revisionRequest)
    if (!('documentId' in revised)) throw new Error('Expected restore receipt')
    await expect(asset.publish(revisionRequest.operationId)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    const sharedId = crypto.randomUUID()
    const concurrentTx = concurrentTransactions()
    const concurrent = await Promise.allSettled([
      history({ ...restore(revised.revisionId), operationId: sharedId }, concurrentTx),
      publishDesignLibraryAsset({ ...asset.request, operationId: sharedId }, actorId, authorize, asset.storage, concurrentTx)
    ])
    expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(concurrent.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'IDEMPOTENCY_CONFLICT' } })
    expect((await admin!.query(`SELECT
      (SELECT count(*) FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2) +
      (SELECT count(*) FROM email_asset_publication_receipts WHERE actor_id=$1 AND operation_id=$2) AS count`, [actorId, sharedId])).rows[0].count).toBe('1')
    // Namespace includes actor as well as action; another authorized actor can
    // independently publish with the same action UUID.
    const otherActor = crypto.randomUUID()
    expect(await publishDesignLibraryAsset(asset.request, otherActor, authorize, asset.storage, transaction)).toEqual(assetReceipt)
  })
})
