import fs from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { executeDesignModules } from '../../server/utils/email-marketing/designModules'
import { ensureLegacyDesignDocument, saveTemplateDesignDraft, type DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { publishDesignLibraryAsset } from '../../server/utils/email-marketing/designLibraryOperations'
import type { DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import { structuredDesign } from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'

const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const databaseTest = socket ? it : it.skip
const schema = `figflow_native_library_${crypto.randomUUID().replaceAll('-', '')}`
const config = () => ({ host: socket, port: 55483, user: 'figflow_test', database: 'figflow_design_test', connectionTimeoutMillis: 5000 })
let admin: pg.Client | undefined
let created = false
let actorId: string, templateId: string, documentId: string, head: string, blockId: string
let assetA: string, assetB: string
let revoked = false
const scope = structuredDesign().scope.clientId
const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64'))
const storage: DesignAssetStorage = { read: async () => bytes, url: async id => `https://example.invalid/registered/${id}`, identifyUrl: async value => value.split('/').at(-1)! }
const authorize = async (clientId: string | null) => {
  if (revoked || clientId !== scope) throw new Error('synthetic access revoked')
}
const authority = () => ({ actorId, read: authorize, designer: authorize, publisher: authorize })
const transaction: DesignTransaction = async (callback) => {
  const db = new pg.Client(config())
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query(`SET LOCAL search_path TO ${schema}`)
    await db.query('SET LOCAL statement_timeout = \'10s\'; SET LOCAL lock_timeout = \'5s\'')
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
const replacement = () => ({ version: 1, command: 'replace-published-image', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: head, blockId, assetId: assetB })
const run = (request: unknown, tx = transaction, renderer = testEmailRenderer) => executeDesignModules(request, authority(), renderer, storage, tx)
describe('08a image replacement with isolated real PostgreSQL', () => {
  beforeAll(async () => {
    if (!socket) return
    if (socket !== '/private/tmp/figflow-postgres-20261102-recovered') throw new Error('Requires the assigned disposable cluster')
    admin = new pg.Client(config())
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}`)
    created = true
    await admin.query(`SET search_path TO ${schema}`)
    await admin.query(`CREATE TABLE agency_clients(id uuid PRIMARY KEY);
      CREATE TABLE edm_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,template_kind text,body_source jsonb,body_html text,subject text,preview_text text,updated_at timestamptz DEFAULT now());
      CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY,client_id uuid,blocks jsonb);
      CREATE TABLE campaigns(id uuid PRIMARY KEY,client_id uuid,status text,body_html text);
      CREATE TABLE banner_assets(id uuid PRIMARY KEY,client_id uuid,uploaded_by uuid,r2_key text,url text,mime_type text,file_size integer);`)
    for (const file of ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '495_email_asset_publication.sql']) await admin.query(fs.readFileSync(`server/database/migrations/${file}`, 'utf8'))
    await admin.query('INSERT INTO agency_clients(id) VALUES($1)', [scope])
  })
  beforeEach(async () => {
    if (!admin) return
    revoked = false
    actorId = crypto.randomUUID()
    templateId = crypto.randomUUID()
    assetA = crypto.randomUUID()
    assetB = crypto.randomUUID()
    const source = structuredDesign()
    await admin.query('INSERT INTO edm_templates(id,client_id,template_kind,body_source,body_html,subject,preview_text) VALUES($1,$2,\'draft\',$3::jsonb,\'legacy\',\'Synthetic subject\',\'Synthetic preview\')', [templateId, scope, JSON.stringify(source.blocks)])
    const baseline = await ensureLegacyDesignDocument({ kind: 'template', ownerId: templateId, actorId }, authorize, transaction)
    documentId = baseline.documentId
    head = (await saveTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: baseline.revisionId, design: source }, authorize, testEmailRenderer, transaction)).revisionId
    for (const id of [assetA, assetB]) {
      await admin.query('INSERT INTO banner_assets(id,client_id,uploaded_by,r2_key,url,mime_type,file_size) VALUES($1,$2,$3,$4,$5,\'image/png\',$6)', [id, scope, actorId, `banner-assets/${actorId}/${id}/image.png`, await storage.url(id), bytes.length])
      await publishDesignLibraryAsset({ version: 1, operationId: crypto.randomUUID(), assetId: id }, actorId, authorize, storage, transaction)
    }
    const operationId = crypto.randomUUID()
    head = (await run({ version: 1, command: 'insert-published-image', operationId, draftId: documentId, expectedDraftRevisionId: head, assetId: assetA, parentId: 'root', index: 1 })).revisionId
    blockId = `img_${operationId}`
  })
  afterAll(async () => {
    if (!admin) return
    try {
      if (created) {
        await admin.query(`DROP SCHEMA ${schema} CASCADE`)
        const remaining = (await admin.query('SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS present', [schema])).rows[0].present
        expect(remaining).toBe(false)
        fs.writeFileSync('.verification/native-library-pg-cleanup.json', JSON.stringify({ schema, dropped: !remaining, scope: 'only this disposable schema' }, null, 2))
      }
    } finally {
      await admin.end()
    }
  })
  for (const kind of ['ungranted logo', 'alt-only nonlibrary logo', 'legal value', 'unknown own data', 'locked ancestor', 'unknown ancestor data', 'forged library lineage']) {
    databaseTest(`refuses ${kind} with no head, revision, projection or receipt effect`, async () => {
      const row = (await admin!.query('SELECT payload FROM email_design_revisions WHERE id=$1', [head])).rows[0]
      const source = row.payload
      if (kind === 'ungranted logo') source.policy.editableFields = []
      if (kind === 'alt-only nonlibrary logo') source.lineage = source.lineage.filter((item: { blockId: string }) => item.blockId !== blockId)
      if (kind === 'legal value') source.blocks[blockId].data.props.alt = 'postal address'
      if (kind === 'unknown own data') source.blocks[blockId].data.extension = true
      if (kind === 'locked ancestor') source.blocks.root.data.props = { brand: 'protected' }
      if (kind === 'unknown ancestor data') source.blocks.root.data.extension = true
      if (kind === 'forged library lineage') {
        const op = crypto.randomUUID(), id = `img_${op}`, old = blockId
        source.blocks[id] = source.blocks[old]
        Reflect.deleteProperty(source.blocks, old)
        source.blocks.root.data.childrenIds[1] = id
        source.lineage = source.lineage.filter((item: { blockId: string }) => item.blockId !== old)
        source.lineage.push({ blockId: id, nodeId: `imgn_${op}`, fields: { alt: `imgf_${op}` } })
        source.policy.editableFields = source.policy.editableFields.map((path: string) => path.replace(old, id))
        blockId = id
      }
      head = (await saveTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: head, design: source }, authorize, testEmailRenderer, transaction)).revisionId
      const snapshot = async () => ({
        document: (await admin!.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1', [documentId])).rows,
        revisions: (await admin!.query('SELECT id FROM email_design_revisions WHERE document_id=$1 ORDER BY id', [documentId])).rows,
        projection: (await admin!.query('SELECT body_source,body_html,email_design_revision_id FROM edm_templates WHERE id=$1', [templateId])).rows,
        receipts: (await admin!.query('SELECT operation_id FROM email_design_revision_receipts WHERE document_id=$1 ORDER BY operation_id', [documentId])).rows
      })
      const before = await snapshot()
      await expect(run(replacement())).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
      expect(await snapshot()).toEqual(before)
    })
  }
  databaseTest('commits identity-preserving replacement and reconciles an actual committed lost reply once', async () => {
    const request = replacement()
    const lost: DesignTransaction = async (callback) => {
      await transaction(callback)
      throw new Error('committed reply lost')
    }
    await expect(run(request, lost)).rejects.toThrow('committed reply lost')
    const receipt = await run(request)
    const row = (await admin!.query('SELECT r.payload,t.body_source,t.email_design_revision_id FROM email_design_revisions r JOIN email_design_documents d ON d.id=r.document_id JOIN edm_templates t ON t.id=d.template_id WHERE r.id=$1', [receipt.revisionId])).rows[0]
    expect(row.payload.assets.map((a: { id: string }) => a.id)).toEqual([assetA, assetB])
    expect(row.payload.blocks[blockId].data.props).toEqual({ url: await storage.url(assetB), alt: '' })
    expect(row.body_source).toEqual(row.payload.blocks)
    expect(row.email_design_revision_id).toBe(receipt.revisionId)
    expect(await run(request)).toEqual(receipt)
    expect((await admin!.query('SELECT count(*)::int AS n FROM email_design_revisions WHERE document_id=$1 AND parent_revision_id=$2', [documentId, head])).rows[0].n).toBe(1)
  })
  databaseTest('allows exactly one concurrent same-head replacement and refuses stale/revoked effects', async () => {
    const results = await Promise.allSettled([run(replacement()), run(replacement())])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    await expect(run(replacement())).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    revoked = true
    await expect(run(replacement())).rejects.toThrow('synthetic access revoked')
  })
  databaseTest('rolls back a replacement when authority is revoked during compilation', async () => {
    const request = replacement()
    await expect(run(request, transaction, { ...testEmailRenderer, renderDocument: async (...args) => {
      const result = await testEmailRenderer.renderDocument(...args)
      revoked = true
      return result
    } })).rejects.toThrow('synthetic access revoked')
    expect((await admin!.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1', [documentId])).rows[0].head_revision_id).toBe(head)
    expect((await admin!.query('SELECT count(*)::int AS n FROM email_design_revision_receipts WHERE operation_id=$1', [request.operationId])).rows[0].n).toBe(0)
  })
})
