import fs from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyDesignerOperations, type DesignerOperation } from '../../shared/emailRendering/designDesigner'
import { composerToDesignDraft } from '../../shared/emailRendering/designComposer'
import { validateEmailDesign, type EmailDesignDocument } from '../../shared/emailRendering/designContract'
import {
  appendDesignRevision, ensureLegacyDesignDocument, saveCampaignDesignDraft, saveStaffCampaignDesignDraft, saveDesignerCampaignDesignDraft,
  saveTemplateDesignDraft, type DesignTransaction, type SaveCampaignDesignDraftInput
} from '../../server/utils/email-marketing/designRevisions'
import { initializeCampaignDesignDraft } from '../../server/utils/email-marketing/designInitialization'
import { getDesignDraft, getTemplateDesignDraft } from '../../server/utils/email-marketing/designReads'
import { saveCampaignDraftMetadata, saveTemplateDraftMetadata } from '../../server/utils/email-marketing/designMetadata'
import { structuredDesign } from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'

const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const databaseTest = socket ? it : it.skip
const schema = `figflow_campaign_foundation_${Date.now()}_${process.pid}`
const scope = structuredDesign().scope.clientId
const config = () => ({ host: socket, port: 55483, user: 'figflow_test', database: 'figflow_design_test' })
let admin: pg.Client
let campaignId: string
let documentId: string
let actorId: string
let baseline: string
let preMigrationBaseline: { documentId: string, revisionId: string }
const allow = async () => {}
const transaction: DesignTransaction = async (callback) => {
  const client = new pg.Client(config())
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL search_path TO ${schema}, public`)
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { await client.end() }
}
const design = () => validateEmailDesign({ ...structuredDesign(), kind: 'campaign-draft' })
const request = (expectedRevisionId = baseline, source = design()): SaveCampaignDesignDraftInput => ({
  documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId, design: source,
  subject: 'Campaign subject', previewText: 'Campaign preheader'
})
const row = async () => (await admin.query('SELECT to_jsonb(c) AS value FROM campaigns c WHERE id=$1', [campaignId])).rows[0].value
const head = async () => (await admin.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1', [documentId])).rows[0].head_revision_id
const counts = async () => (await admin.query(`SELECT
  (SELECT count(*)::int FROM email_design_revisions WHERE document_id=$1) AS revisions,
  (SELECT count(*)::int FROM email_design_revision_receipts WHERE document_id=$1) AS receipts`, [documentId])).rows[0]
async function templatePin(clientId: string | null = scope) {
  const templateId = crypto.randomUUID()
  await admin.query('INSERT INTO edm_templates(id,client_id,body_source) VALUES ($1,$2,$3)', [templateId, clientId, structuredDesign().blocks])
  const root = await ensureLegacyDesignDocument({ kind: 'template', ownerId: templateId, actorId }, allow, transaction)
  const source = structuredDesign()
  source.scope.clientId = clientId
  const pin = await appendDesignRevision({ documentId: root.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: root.revisionId, design: source }, allow, transaction)
  return { ...pin, templateId }
}

beforeAll(async () => {
  if (!socket) return
  if (socket !== '/private/tmp/figflow-postgres-20261102-recovered') throw new Error('Requires the assigned disposable FigFlow cluster')
  admin = new pg.Client(config())
  await admin.connect()
  expect((await admin.query('SELECT current_database() AS db, current_user AS actor')).rows[0]).toEqual({ db: 'figflow_design_test', actor: 'figflow_test' })
  await admin.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}, public`)
  await admin.query(`CREATE TABLE agency_clients(id uuid PRIMARY KEY);
    CREATE TABLE edm_templates(id uuid PRIMARY KEY,client_id uuid,body_source jsonb,body_html text,subject text,preview_text text,template_kind text DEFAULT 'draft',updated_at timestamptz DEFAULT now());
    CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY,client_id uuid,blocks jsonb);
    CREATE TABLE campaigns(id uuid PRIMARY KEY,client_id uuid,status text DEFAULT 'draft',sent integer NOT NULL DEFAULT 0,to_send integer NOT NULL DEFAULT 0,delivered integer NOT NULL DEFAULT 0,body_source jsonb,body_html text,subject text,preview_text text,template_id uuid,updated_at timestamptz DEFAULT now());`)
  for (const filename of ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql']) {
    await admin.query(fs.readFileSync(new URL(`../../server/database/migrations/${filename}`, import.meta.url), 'utf8'))
  }
  // Pre-existing legacy/frozen rows must survive additive migration byte-for-byte.
  await admin.query('INSERT INTO agency_clients VALUES ($1)', [scope])
  await admin.query(`INSERT INTO campaigns(id,client_id,status,body_html) VALUES ('90000000-0000-4000-8000-000000000009',$1,'sent','historical frozen HTML')`, [scope])
  const before = (await admin.query('SELECT to_jsonb(c) AS value FROM campaigns c')).rows[0].value
  await admin.query('INSERT INTO campaigns(id,client_id,body_source) VALUES ($1,$2,$3)', ['90000000-0000-4000-8000-000000000008', scope, structuredDesign().blocks])
  preMigrationBaseline = await ensureLegacyDesignDocument({ kind: 'campaign-draft', ownerId: '90000000-0000-4000-8000-000000000008', actorId: crypto.randomUUID() }, allow, transaction)
  const migration = fs.readFileSync(new URL('../../server/database/migrations/498_email_campaign_design_projection.sql', import.meta.url), 'utf8')
  await admin.query(migration)
  await admin.query(migration)
  expect((await admin.query('SELECT to_jsonb(c)-\'email_design_revision_id\' AS value FROM campaigns c WHERE id=\'90000000-0000-4000-8000-000000000009\'')).rows[0].value).toEqual(before)
  expect((await admin.query('SELECT email_design_revision_id FROM campaigns')).rows[0].email_design_revision_id).toBeNull()
  expect((await admin.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=\'campaigns\' AND column_name=\'review_status\'', [schema])).rows).toEqual([])
})
beforeEach(async () => {
  if (!socket) return
  actorId = crypto.randomUUID()
  campaignId = crypto.randomUUID()
  await admin.query('INSERT INTO campaigns(id,client_id,body_source,body_html,subject,preview_text) VALUES ($1,$2,$3,$4,$5,$6)',
    [campaignId, scope, structuredDesign().blocks, 'legacy HTML', 'Legacy subject', 'Legacy preview'])
  const result = await initializeCampaignDesignDraft({ campaignId, actorId, expectedClientId: scope }, allow, transaction)
  documentId = result.documentId
  baseline = result.revisionId
})
afterAll(async () => {
  if (!admin) return
  try {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    expect((await admin.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [schema])).rows).toEqual([])
  } finally { await admin.end() }
})

describe('campaign owner foundation on real PostgreSQL', () => {
  databaseTest('does not treat the additive null pointer as a legacy content edit on a pre-498 baseline', async () => {
    const read = await getDesignDraft(preMigrationBaseline.documentId, allow, admin)
    expect(read).toMatchObject({ state: 'legacy', ownerChangedSinceSnapshot: false })
    const saved = await saveCampaignDesignDraft({ ...request(), documentId: preMigrationBaseline.documentId, expectedRevisionId: preMigrationBaseline.revisionId }, allow, testEmailRenderer, transaction)
    expect(await getDesignDraft(preMigrationBaseline.documentId, allow, admin)).toMatchObject({ headRevisionId: saved.revisionId, projection: { state: 'current' } })
  })
  databaseTest('snapshots its own row, reuses the same baseline, and never guesses template provenance', async () => {
    const original = await row()
    expect(await initializeCampaignDesignDraft({ campaignId, actorId, expectedClientId: scope }, allow, transaction)).toMatchObject({ documentId, revisionId: baseline, schemaVersion: 0 })
    const read = await getDesignDraft(documentId, allow, admin)
    expect(read).toMatchObject({ owner: { kind: 'campaign', id: campaignId }, state: 'legacy', baseTemplateRevisionId: null })
    expect(JSON.parse(read.source as string)).toEqual(original)
    await expect(getTemplateDesignDraft(documentId, allow, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await counts()).toEqual({ revisions: 1, receipts: 0 })
  })
  databaseTest('commits canonical content, subject, preview, HTML digest, head and receipt in one projection', async () => {
    const original = await row()
    const source = composerToDesignDraft(original.body_source, scope, 'campaign-draft')
    const input = request(baseline, source)
    const saved = await saveCampaignDesignDraft(input, allow, testEmailRenderer, transaction)
    expect(await row()).toMatchObject({ subject: input.subject, preview_text: input.previewText, body_source: source.blocks, email_design_revision_id: saved.revisionId })
    const revision = (await admin.query('SELECT r.payload,r.subject,r.preview_text,r.base_template_revision_id,r.rendered_html_sha256=encode(sha256(convert_to(c.body_html,\'UTF8\')),\'hex\') AS hash_matches FROM email_design_revisions r CROSS JOIN campaigns c WHERE r.id=$1 AND c.id=$2', [saved.revisionId, campaignId])).rows[0]
    expect(revision).toMatchObject({ payload: source, subject: input.subject, preview_text: input.previewText, base_template_revision_id: null, hash_matches: true })
    expect(await getDesignDraft(documentId, allow, admin)).toMatchObject({ state: 'structured', owner: { kind: 'campaign', id: campaignId }, headRevisionId: saved.revisionId, projectionRevisionId: saved.revisionId, projection: { state: 'current' }, metadata: { subject: input.subject, previewText: input.previewText } })
    expect(await counts()).toEqual({ revisions: 2, receipts: 1 })
  })
  databaseTest('leaves source-only and schema-0 rows unactivated and permits their legacy editor', async () => {
    const saved = await appendDesignRevision({ ...request(), subject: undefined, previewText: undefined } as never, allow, transaction).catch(error => error)
    expect(saved).toMatchObject({ code: 'KIND_MISMATCH' })
    const { subject: _subject, previewText: _preview, ...input } = request()
    await appendDesignRevision(input, allow, transaction)
    await admin.query('UPDATE campaigns SET body_html=$2,subject=$3 WHERE id=$1', [campaignId, 'legacy editor', 'legacy title'])
    expect((await row()).email_design_revision_id).toBeNull()
    expect(await getDesignDraft(documentId, allow, admin)).toMatchObject({ projection: { state: 'unprojected' } })
  })
  databaseTest('refuses changed legacy content and staff first conversion without resetting the baseline', async () => {
    const before = await row()
    await expect(saveStaffCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'STRUCTURED_REVISION_REQUIRED' })
    await admin.query('UPDATE campaigns SET body_html=$2 WHERE id=$1', [campaignId, 'intervening legacy edit'])
    await expect(saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'LEGACY_CONTENT_CHANGED' })
    expect(await head()).toBe(baseline)
    expect((await row()).body_source).toEqual(before.body_source)
  })
  databaseTest('does not invoke projection functions for counter, webhook, status or unchanged content updates', async () => {
    const first = await saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)
    const before = await row()
    const names = ['email_design_protect_campaign_projection', 'email_design_check_campaign_projection']
    const originals: string[] = []
    await admin.query('CREATE TABLE projection_function_invocations(function_name text, table_name text, operation text)')
    try {
      // Instrument the real functions in this unique schema without replacing
      // their bodies: zero calls must be proven after every deferred COMMIT.
      for (const name of names) {
        const original = (await admin.query('SELECT pg_get_functiondef($1::regprocedure) AS definition', [`${name}()`])).rows[0].definition as string
        originals.push(original)
        expect(original).toContain('BEGIN\n')
        await admin.query(original.replace('BEGIN\n', `BEGIN\n  INSERT INTO projection_function_invocations VALUES ('${name}', TG_TABLE_NAME, TG_OP);\n`))
      }
      await admin.query('UPDATE campaigns SET to_send=to_send+1 WHERE id=$1', [campaignId])
      await admin.query('UPDATE campaigns SET sent=sent+1,delivered=delivered+1 WHERE id=$1', [campaignId])
      for (const status of ['scheduled', 'sending', 'sent']) {
        await admin.query('UPDATE campaigns SET status=$2 WHERE id=$1', [campaignId, status])
      }
      // A statement may mention every protected column without changing any.
      await admin.query(`UPDATE campaigns SET body_source=body_source,body_html=body_html,subject=subject,
        preview_text=preview_text,email_design_revision_id=email_design_revision_id,to_send=to_send+1 WHERE id=$1`, [campaignId])
      expect((await admin.query('SELECT * FROM projection_function_invocations')).rows).toEqual([])
      expect(await row()).toMatchObject({ body_source: before.body_source, body_html: before.body_html,
        email_design_revision_id: first.revisionId, status: 'sent', sent: 1, delivered: 1, to_send: 2 })
      // Positive control proves the instrumentation is live and the document
      // deferred trigger is retained alongside both campaign projection checks.
      await admin.query('UPDATE campaigns SET status=\'draft\' WHERE id=$1', [campaignId])
      await saveCampaignDesignDraft({ ...request(first.revisionId), subject: 'Changed canonical subject' }, allow, testEmailRenderer, transaction)
      const invoked = (await admin.query('SELECT function_name,table_name,operation FROM projection_function_invocations ORDER BY function_name,table_name')).rows
      expect(invoked).toEqual([
        { function_name: 'email_design_check_campaign_projection', table_name: 'campaigns', operation: 'UPDATE' },
        { function_name: 'email_design_check_campaign_projection', table_name: 'email_design_documents', operation: 'UPDATE' },
        { function_name: 'email_design_protect_campaign_projection', table_name: 'campaigns', operation: 'UPDATE' }
      ])
    } finally {
      for (const original of originals) await admin.query(original)
      await admin.query('DROP TABLE projection_function_invocations')
    }
  })
  databaseTest('retains insert pointer validation and refuses real edits when other named projection values stay equal', async () => {
    const first = await saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)
    await expect(admin.query('INSERT INTO campaigns(id,client_id,email_design_revision_id) VALUES ($1,$2,$3)',
      [crypto.randomUUID(), scope, first.revisionId])).rejects.toMatchObject({ code: '55000', constraint: 'email_design_campaign_revision_required' })
    await expect(admin.query('UPDATE campaigns SET email_design_revision_id=email_design_revision_id,subject=$2 WHERE id=$1',
      [campaignId, 'Raw changed subject'])).rejects.toMatchObject({ code: '55000', constraint: 'email_design_campaign_revision_required' })
    expect((await row()).email_design_revision_id).toBe(first.revisionId)
  })
  databaseTest('rejects raw projection content, metadata, HTML, pointer clear, cross-owner pointer and rewind', async () => {
    const first = await saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)
    const second = await saveCampaignDesignDraft(request(first.revisionId), allow, testEmailRenderer, transaction)
    const foreignPointer = await templatePin()
    await expect(admin.query('UPDATE campaigns SET email_design_revision_id=$2 WHERE id=$1', [campaignId, foreignPointer.revisionId])).rejects.toMatchObject({ code: '55000' })
    for (const [column, value] of [['body_html', 'tampered'], ['subject', 'tampered'], ['preview_text', 'tampered'], ['body_source', '{}'], ['email_design_revision_id', null], ['email_design_revision_id', baseline], ['email_design_revision_id', first.revisionId]]) {
      await expect(admin.query(`UPDATE campaigns SET ${column}=$2 WHERE id=$1`, [campaignId, value])).rejects.toMatchObject({ code: '55000' })
    }
    await expect(admin.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [documentId, first.revisionId])).rejects.toMatchObject({ code: '55000' })
    expect(await head()).toBe(second.revisionId)
  })
  databaseTest('deferred consistency refuses a source-only successor for an opted-in campaign', async () => {
    const first = await saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)
    const { subject: _subject, previewText: _preview, ...input } = request(first.revisionId)
    await expect(appendDesignRevision(input, allow, transaction)).rejects.toMatchObject({ code: '55000', constraint: 'email_design_campaign_projection_consistent' })
    expect(await head()).toBe(first.revisionId)
    expect(await counts()).toEqual({ revisions: 2, receipts: 1 })
  })
  databaseTest('rejects matching head/source with a wrong rendered HTML digest at SQL boundary', async () => {
    await expect(transaction(async (db) => {
      const revision = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,subject,preview_text,rendered_html_sha256)
        VALUES ($1,$2,1,$3,$4,'Campaign subject','Campaign preheader',$5) RETURNING id`, [documentId, baseline, JSON.stringify(design()), actorId, 'a'.repeat(64)])).rows[0] as { id: string }
      await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [documentId, revision.id])
      await db.query(`UPDATE campaigns SET body_source=$2,body_html='wrong output',subject='Campaign subject',preview_text='Campaign preheader',email_design_revision_id=$3 WHERE id=$1`, [campaignId, design().blocks, revision.id])
    })).rejects.toMatchObject({ code: '55000', constraint: 'email_design_campaign_revision_required' })
    expect(await head()).toBe(baseline)
  })
  databaseTest('gives concurrent staff and designer writers from one head exactly one winner', async () => {
    const first = await saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)
    const outcomes = await Promise.allSettled([
      saveCampaignDesignDraft(request(first.revisionId), allow, testEmailRenderer, transaction),
      saveStaffCampaignDesignDraft(request(first.revisionId), allow, testEmailRenderer, transaction)
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'REVISION_CONFLICT' } })
    expect(await counts()).toEqual({ revisions: 3, receipts: 2 })
  })
  databaseTest('re-evaluates reviewed designer operations against the stored campaign head and binds their proposal identity', async () => {
    const first = await saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)
    const operations: DesignerOperation[] = [{ op: 'set-style', blockId: 'heading', style: { color: '#123456' } }]
    const proposalOperationId = crypto.randomUUID()
    const candidate = applyDesignerOperations(design(), operations, proposalOperationId)
    const input = { ...request(first.revisionId, candidate), operations, proposalOperationId }
    await expect(saveDesignerCampaignDesignDraft({ ...input, operations: [] }, allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
    const receipt = await saveDesignerCampaignDesignDraft(input, allow, testEmailRenderer, transaction)
    expect((await row()).body_html).toContain('#123456')
    expect(await getDesignDraft(documentId, allow, admin)).toMatchObject({ source: { kind: 'campaign-draft' }, headRevisionId: receipt.revisionId })
    expect(await saveDesignerCampaignDesignDraft(input, allow, testEmailRenderer, transaction)).toEqual(receipt)
    await expect(saveDesignerCampaignDesignDraft({ ...input, proposalOperationId: crypto.randomUUID() }, allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  databaseTest('binds operation receipts to owner, command, expected head, metadata and content', async () => {
    const first = await saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)
    const input = request(first.revisionId)
    await saveStaffCampaignDesignDraft(input, allow, testEmailRenderer, transaction)
    for (const changed of [{ ...input, subject: 'changed' }, { ...input, previewText: null }, { ...input, expectedRevisionId: baseline }, { ...input, design: { ...design(), policy: { version: 1, editableFields: [] } } }]) {
      await expect(saveStaffCampaignDesignDraft(changed, allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    }
    await expect(saveCampaignDesignDraft(input, allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  databaseTest('returns the original confirmed receipt after later head and freeze with fresh read authority', async () => {
    const input = request()
    const first = await saveCampaignDesignDraft(input, allow, testEmailRenderer, transaction)
    const later = await saveCampaignDesignDraft(request(first.revisionId), allow, testEmailRenderer, transaction)
    await admin.query('UPDATE campaigns SET status=\'scheduled\' WHERE id=$1', [campaignId])
    for (const column of ['body_html', 'subject']) {
      await expect(admin.query(`UPDATE campaigns SET ${column}=$2 WHERE id=$1`, [campaignId, 'Frozen raw edit']))
        .rejects.toMatchObject({ code: '55000', constraint: 'email_design_campaign_revision_required' })
    }
    const noRender = { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('replay must not render')
    } }
    expect(await saveCampaignDesignDraft(input, allow, noRender, transaction)).toEqual(first)
    expect(await getDesignDraft(documentId, allow, admin)).toMatchObject({ headRevisionId: later.revisionId, projection: { state: 'current' } })
    await expect(saveCampaignDesignDraft(input, async () => {
      throw new Error('read revoked')
    }, noRender, transaction)).rejects.toThrow('read revoked')
    await expect(saveCampaignDesignDraft(request(later.revisionId), allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'CAMPAIGN_FROZEN' })
    await expect(initializeCampaignDesignDraft({ campaignId, actorId, expectedClientId: scope }, allow, transaction)).rejects.toMatchObject({ code: 'CAMPAIGN_FROZEN' })
    expect(await counts()).toEqual({ revisions: 3, receipts: 2 })
  })
  databaseTest('SQL refuses non-draft structured revisions even without an opted-in pointer', async () => {
    await admin.query('UPDATE campaigns SET status=\'sent\' WHERE id=$1', [campaignId])
    await expect(transaction(async (db) => {
      await db.query('INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by) VALUES ($1,$2,1,$3,$4)', [documentId, baseline, JSON.stringify(design()), actorId])
    })).rejects.toMatchObject({ code: '55000', constraint: 'email_design_campaign_frozen' })
  })
  databaseTest('rolls back source, metadata, HTML, pointer, head and receipt on renderer failure or revoked authority', async () => {
    const before = await row()
    await expect(saveCampaignDesignDraft(request(), allow, { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('renderer failed')
    } }, transaction)).rejects.toThrow('renderer failed')
    let granted = true
    const renderer = { ...testEmailRenderer, renderDocument: async (...args: Parameters<typeof testEmailRenderer.renderDocument>) => {
      const html = await testEmailRenderer.renderDocument(...args)
      granted = false
      return html
    } }
    await expect(saveCampaignDesignDraft(request(), async () => {
      if (!granted) throw new Error('revoked after render')
    }, renderer, transaction)).rejects.toThrow('revoked after render')
    expect(await row()).toEqual(before)
    expect(await head()).toBe(baseline)
    expect(await counts()).toEqual({ revisions: 1, receipts: 0 })
  })
  databaseTest('rolls back projection and source on actual PostgreSQL receipt refusal', async () => {
    const before = await row()
    await admin.query(`CREATE FUNCTION reject_campaign_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt refused'; END $$;
      CREATE TRIGGER reject_campaign_receipt BEFORE INSERT ON email_design_revision_receipts FOR EACH ROW EXECUTE FUNCTION reject_campaign_receipt()`)
    try {
      await expect(saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction)).rejects.toThrow('receipt refused')
      expect(await row()).toEqual(before)
      expect(await head()).toBe(baseline)
      expect(await counts()).toEqual({ revisions: 1, receipts: 0 })
    } finally { await admin.query('DROP TRIGGER reject_campaign_receipt ON email_design_revision_receipts; DROP FUNCTION reject_campaign_receipt()') }
  })
  databaseTest('a real renderer deadline rolls back and late completion never appends', async () => {
    const before = await row()
    let complete: (html: string) => void = () => {}
    await expect(saveCampaignDesignDraft(request(), allow, { ...testEmailRenderer, renderDocument: () => new Promise<string>((resolve) => {
      complete = resolve
    }) }, transaction)).rejects.toMatchObject({ code: 'RENDER_TIMEOUT' })
    complete('<p>late</p>')
    expect(await row()).toEqual(before)
    expect(await head()).toBe(baseline)
    expect(await counts()).toEqual({ revisions: 1, receipts: 0 })
  }, 20000)
  databaseTest('retains an exact template base pin and rejects cross-owner/cross-client and changed successor pins', async () => {
    const pin = await templatePin()
    const another = await templatePin()
    const options = { baseTemplateRevisionId: pin.revisionId, authorizeTemplateRead: allow }
    const input = request()
    const first = await saveCampaignDesignDraft(input, allow, testEmailRenderer, transaction, options)
    const second = await saveStaffCampaignDesignDraft(request(first.revisionId), allow, testEmailRenderer, transaction, { authorizeTemplateRead: allow })
    expect(await getDesignDraft(documentId, allow, admin)).toMatchObject({ baseTemplateRevisionId: pin.revisionId, headRevisionId: second.revisionId })
    expect(await saveCampaignDesignDraft(input, allow, testEmailRenderer, transaction, options)).toEqual(first)
    await expect(saveCampaignDesignDraft(request(second.revisionId), allow, testEmailRenderer, transaction, { ...options, baseTemplateRevisionId: another.revisionId })).rejects.toMatchObject({ code: 'BASE_TEMPLATE_REVISION_CONFLICT' })
    await expect(transaction(async (db) => {
      await db.query('INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,base_template_revision_id) VALUES ($1,$2,1,$3,$4,$5)', [documentId, second.revisionId, JSON.stringify(design()), actorId, another.revisionId])
    })).rejects.toMatchObject({ code: '55000', constraint: 'email_design_base_template_immutable' })
    await expect(saveCampaignDesignDraft(request(second.revisionId), allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'DEPENDENCY_AUTHORITY_REQUIRED' })
    // A campaign revision can never masquerade as a source template pin.
    await expect(transaction(async (db) => {
      await db.query('INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,base_template_revision_id) VALUES ($1,$2,1,$3,$4,$5)', [documentId, second.revisionId, JSON.stringify(design()), actorId, first.revisionId])
    })).rejects.toMatchObject({ code: '55000', constraint: 'email_design_base_template_required' })
    const foreignScope = crypto.randomUUID()
    await admin.query('INSERT INTO agency_clients VALUES ($1)', [foreignScope])
    const foreign = await templatePin(foreignScope)
    await expect(transaction(async (db) => {
      await db.query('INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,base_template_revision_id) VALUES ($1,$2,1,$3,$4,$5)', [documentId, second.revisionId, JSON.stringify(design()), actorId, foreign.revisionId])
    })).rejects.toMatchObject({ code: '55000', constraint: 'email_design_base_template_required' })
    await expect(saveCampaignDesignDraft(request(second.revisionId), allow, testEmailRenderer, transaction, { ...options, baseTemplateRevisionId: foreign.revisionId })).rejects.toThrow()
    expect((await admin.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1', [pin.documentId])).rows[0].head_revision_id).toBe(pin.revisionId)
  })
  databaseTest('rechecks base-template read authority after rendering and before historical receipt replay', async () => {
    const pin = await templatePin()
    const input = request()
    const first = await saveCampaignDesignDraft(input, allow, testEmailRenderer, transaction, { baseTemplateRevisionId: pin.revisionId, authorizeTemplateRead: allow })
    const denied = async () => {
      throw new Error('template read revoked')
    }
    await expect(saveCampaignDesignDraft(input, allow, testEmailRenderer, transaction, { baseTemplateRevisionId: pin.revisionId, authorizeTemplateRead: denied })).rejects.toThrow('template read revoked')
    let granted = true
    const renderer = { ...testEmailRenderer, renderDocument: async (...args: Parameters<typeof testEmailRenderer.renderDocument>) => {
      const html = await testEmailRenderer.renderDocument(...args)
      granted = false
      return html
    } }
    await expect(saveCampaignDesignDraft(request(first.revisionId), allow, renderer, transaction, { authorizeTemplateRead: async () => {
      if (!granted) throw new Error('template revoked during render')
    } })).rejects.toThrow('template revoked during render')
    expect(await head()).toBe(first.revisionId)
    expect(await counts()).toEqual({ revisions: 2, receipts: 1 })
  })
  databaseTest('metadata-only campaign successor copies canonical bytes and replays after freeze without rendering', async () => {
    const pin = await templatePin()
    const options = { baseTemplateRevisionId: pin.revisionId, authorizeTemplateRead: allow }
    const first = await saveCampaignDesignDraft(request(), allow, testEmailRenderer, transaction, options)
    const input = { documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: first.revisionId, expectedClientId: scope, subject: 'Metadata title', previewText: null }
    const receipt = await saveCampaignDraftMetadata(input, allow, testEmailRenderer, transaction, { authorizeTemplateRead: allow })
    expect(await getDesignDraft(documentId, allow, admin)).toMatchObject({ metadata: { subject: input.subject, previewText: null }, baseTemplateRevisionId: pin.revisionId })
    const payloads = (await admin.query('SELECT payload_text FROM email_design_revisions WHERE id=ANY($1::uuid[])', [[first.revisionId, receipt.revisionId]])).rows
    expect(payloads[0]).toEqual(payloads[1])
    await admin.query('UPDATE campaigns SET status=\'sent\' WHERE id=$1', [campaignId])
    const noRender = { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('no replay render')
    } }
    expect(await saveCampaignDraftMetadata(input, allow, noRender, transaction, { authorizeTemplateRead: allow })).toEqual(receipt)
    await expect(saveTemplateDraftMetadata(input, allow, noRender, transaction)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  databaseTest('rolls back a newly initialized baseline and conversion together in the caller transaction', async () => {
    const newCampaignId = crypto.randomUUID()
    await admin.query('INSERT INTO campaigns(id,client_id,body_source,body_html) VALUES ($1,$2,$3,$4)', [newCampaignId, scope, structuredDesign().blocks, 'original campaign'])
    await expect(transaction(async (db) => {
      const operationId = crypto.randomUUID()
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${actorId}:${operationId}`])
      const sameTransaction: DesignTransaction = callback => callback(db)
      const initialized = await initializeCampaignDesignDraft({ campaignId: newCampaignId, actorId, expectedClientId: scope }, allow, sameTransaction)
      await saveCampaignDesignDraft({ ...request(), operationId, documentId: initialized.documentId, expectedRevisionId: initialized.revisionId }, allow, testEmailRenderer, sameTransaction)
      throw new Error('caller rollback after conversion')
    })).rejects.toThrow('caller rollback after conversion')
    expect((await admin.query('SELECT id FROM email_design_documents WHERE campaign_id=$1', [newCampaignId])).rows).toEqual([])
    expect((await admin.query('SELECT body_html,email_design_revision_id FROM campaigns WHERE id=$1', [newCampaignId])).rows[0]).toEqual({ body_html: 'original campaign', email_design_revision_id: null })
  })
  databaseTest('locks actor-operation then persisted owner then document and does not open an independent transaction', async () => {
    const statements: string[] = []
    let transactions = 0
    const observed: DesignTransaction = (callback) => {
      transactions++
      return transaction(db => callback({ query: (sql, params) => {
        statements.push(sql)
        return db.query(sql, params)
      } }))
    }
    await saveCampaignDesignDraft(request(), allow, testEmailRenderer, observed)
    const locks = statements.filter(sql => sql.includes('pg_advisory_xact_lock') || sql.includes('FOR UPDATE'))
    expect(transactions).toBe(1)
    expect(locks).toHaveLength(3)
    expect(locks[0]).toContain('pg_advisory_xact_lock')
    expect(locks[1]).toContain('FROM campaigns WHERE id=$1 FOR UPDATE')
    expect(locks[2]).toContain('FROM email_design_documents WHERE id=$1 FOR UPDATE')
  })
  databaseTest('retains the pre-existing template metadata receipt digest contract', async () => {
    const pin = await templatePin()
    const input = { documentId: pin.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: pin.revisionId, expectedClientId: scope, subject: 'Template metadata', previewText: null }
    const receipt = await saveTemplateDraftMetadata(input, allow, testEmailRenderer, transaction)
    const expectedText = JSON.stringify({ target: 'template-metadata', documentId: input.documentId,
      expectedRevisionId: input.expectedRevisionId, expectedClientId: scope, subject: input.subject, previewText: null })
    const stored = (await admin.query('SELECT payload_sha256=encode(sha256(convert_to($3,\'UTF8\')),\'hex\') AS matches FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, input.operationId, expectedText])).rows[0]
    expect(stored).toEqual({ matches: true })
    expect(await saveTemplateDraftMetadata(input, allow, testEmailRenderer, transaction)).toEqual(receipt)
  })
  databaseTest('rejects campaign-only save fields and owner spoofing at template wrappers', async () => {
    const pin = await templatePin()
    await expect(saveTemplateDesignDraft({ ...request(), documentId: pin.documentId, expectedRevisionId: pin.revisionId, design: structuredDesign() }, allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'KIND_MISMATCH' })
    await expect(saveCampaignDesignDraft({ ...request(), documentId: pin.documentId, expectedRevisionId: pin.revisionId }, allow, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'KIND_MISMATCH' })
    await expect(saveCampaignDesignDraft({ ...request(), owner: { kind: 'template', id: pin.templateId } } as never, allow, testEmailRenderer, transaction)).rejects.toThrow()
  })
  databaseTest('preserves module pins, policy and lineage through staff edits while independently authorizing dependencies', async () => {
    const moduleId = crypto.randomUUID()
    await admin.query('INSERT INTO edm_custom_modules(id,client_id) VALUES ($1,$2)', [moduleId, scope])
    const root = await ensureLegacyDesignDocument({ kind: 'module', ownerId: moduleId, actorId }, allow, transaction)
    const module = structuredDesign() as unknown as EmailDesignDocument
    module.kind = 'module'
    delete module.blocks.root
    module.rootChildrenIds = ['heading', 'cta']
    const pin = await appendDesignRevision({ documentId: root.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: root.revisionId, design: module }, allow, transaction)
    const source = design()
    source.dependencies = [{ moduleId, revisionId: pin.revisionId }]
    source.moduleInstances = [{ moduleId, revisionId: pin.revisionId, instanceId: 'hero', rootBlockIds: ['heading', 'cta'], overrides: {} }]
    const first = await saveCampaignDesignDraft(request(baseline, source), allow, testEmailRenderer, transaction, { authorizeModuleRead: allow })
    const input = request(first.revisionId, source)
    const receipt = await saveStaffCampaignDesignDraft(input, allow, testEmailRenderer, transaction, { authorizeModuleRead: allow })
    expect(await getDesignDraft(documentId, allow, admin)).toMatchObject({ source: { dependencies: source.dependencies, moduleInstances: source.moduleInstances, policy: source.policy, lineage: source.lineage }, headRevisionId: receipt.revisionId })
    await expect(saveStaffCampaignDesignDraft(input, allow, testEmailRenderer, transaction, { authorizeModuleRead: async () => {
      throw new Error('module revoked')
    } })).rejects.toThrow('module revoked')
    let granted = true
    const renderer = { ...testEmailRenderer, renderDocument: async (...args: Parameters<typeof testEmailRenderer.renderDocument>) => {
      const html = await testEmailRenderer.renderDocument(...args)
      granted = false
      return html
    } }
    await expect(saveStaffCampaignDesignDraft(request(receipt.revisionId, source), allow, renderer, transaction, { authorizeModuleRead: async () => {
      if (!granted) throw new Error('module revoked after render')
    } })).rejects.toThrow('module revoked after render')
    expect(await head()).toBe(receipt.revisionId)
  })
})
