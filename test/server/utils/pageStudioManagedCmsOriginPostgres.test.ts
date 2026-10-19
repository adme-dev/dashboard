import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { completionReceiptFixture } from '../../helpers/pageStudio/managedTransferCompletion'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { readManagedCmsOrigin } from '~~/server/utils/pageStudio/managedCmsOrigin'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl && !['127.0.0.1', 'localhost'].includes(new URL(databaseUrl).hostname)) throw new Error('Disposable local PostgreSQL required')
describe.runIf(Boolean(databaseUrl))('completed editor origin on real PostgreSQL', () => {
  const schema = `editor_origin_${randomUUID().replaceAll('-', '')}`
  let db: pg.Client
  let receipt: Awaited<ReturnType<typeof completionReceiptFixture>>
  beforeAll(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    // Reader-contract fixture only; actual471 constraints/finalization are
    // exercised by the dedicated terminal migration and completion suites.
    await db.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema},pg_catalog;
      CREATE TABLE page_studio_cms_scopes(scope_key TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,environment TEXT,state TEXT,adoption_id TEXT,transfer_id UUID,retained_by_transfer_id UUID,active_generation UUID,target JSONB,freeze_digest TEXT,current_application_id UUID,current_content_id UUID);
      CREATE TABLE page_studio_managed_transfer_intents(operation_id UUID PRIMARY KEY,intent JSONB,intent_digest TEXT);
      CREATE TABLE page_studio_managed_transfer_completions(operation_id UUID PRIMARY KEY,intent_digest TEXT,receipt JSONB,receipt_json TEXT,receipt_digest TEXT,audit_id UUID,copy_proof_digest TEXT,history_receipt_digest TEXT,source_scope_key TEXT,source_generation UUID,destination_scope_key TEXT,destination_generation UUID);
      CREATE TABLE page_studio_managed_transfer_copy_graph_verifications(operation_id UUID PRIMARY KEY,intent_digest TEXT,proof_digest TEXT);
      CREATE TABLE page_studio_managed_transfer_forms_history_verifications(operation_id UUID PRIMARY KEY,intent_digest TEXT,receipt_digest TEXT);`)
  })
  beforeEach(async () => {
    await db.query('TRUNCATE page_studio_cms_scopes,page_studio_managed_transfer_intents,page_studio_managed_transfer_completions,page_studio_managed_transfer_copy_graph_verifications,page_studio_managed_transfer_forms_history_verifications')
    receipt = await completionReceiptFixture()
    const intent = { operationId: receipt.operationId, authority: { source: receipt.source.scope, destination: receipt.destination.scope },
      source: { context: { state: { active_generation: receipt.source.generation, target: receipt.source.target, freeze_digest: receipt.source.freezeDigest, current_content_id: receipt.source.contentId },
        application: receipt.source.application }, checkpoint: receipt.source.checkpoint }, destination: { generation: receipt.destination.generation } }
    receipt.intentDigest = await collectionDigest(intent)
    const { digest: _, ...body } = receipt
    receipt.digest = await collectionDigest(body)
    await db.query('INSERT INTO page_studio_managed_transfer_intents VALUES($1,$2,$3)', [receipt.operationId, intent, receipt.intentDigest])
    for (const endpoint of [receipt.source, receipt.destination]) {
      const source = endpoint.scope.environment === 'staging'
      await db.query('INSERT INTO page_studio_cms_scopes VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [contentScopeKey(endpoint.scope as never), endpoint.scope.tenantId, endpoint.scope.clientId, endpoint.scope.siteId, endpoint.scope.environment,
          source ? 'retained' : 'managed', source ? 'original-adoption' : null, source ? null : receipt.operationId, source ? receipt.operationId : null,
          endpoint.generation, endpoint.target, endpoint.freezeDigest, endpoint.application.id, endpoint.contentId])
    }
    await db.query('INSERT INTO page_studio_managed_transfer_completions VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [receipt.operationId, receipt.intentDigest, receipt, collectionCanonical(receipt), receipt.digest, receipt.auditId, receipt.copyProofDigest, receipt.historyReceiptDigest,
        contentScopeKey(receipt.source.scope as never), receipt.source.generation, contentScopeKey(receipt.destination.scope as never), receipt.destination.generation])
    await db.query('INSERT INTO page_studio_managed_transfer_copy_graph_verifications VALUES($1,$2,$3)', [receipt.operationId, receipt.intentDigest, receipt.copyProofDigest])
    await db.query('INSERT INTO page_studio_managed_transfer_forms_history_verifications VALUES($1,$2,$3)', [receipt.operationId, receipt.intentDigest, receipt.historyReceiptDigest])
  })
  afterAll(async () => {
    if (!db) return
    await db.query(`DROP SCHEMA ${schema} CASCADE`)
    await db.end()
  })
  const read = async () => {
    await db.query('BEGIN')
    try {
      const result = await readManagedCmsOrigin(db, receipt.destination.scope as never)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }
  it('reads the actual completed destination without adoption or original login tables', async () => {
    expect(await read()).toEqual({ kind: 'transfer', receipt })
  })
  it('keeps editor admission after accepted destination drafts advance', async () => {
    await db.query('UPDATE page_studio_cms_scopes SET current_application_id=$1,current_content_id=$2 WHERE environment=\'production\'', [randomUUID(), randomUUID()])
    expect(await read()).toEqual({ kind: 'transfer', receipt })
  })
  it.each([
    'UPDATE page_studio_cms_scopes SET transfer_id=NULL WHERE environment=\'production\'',
    'UPDATE page_studio_cms_scopes SET active_generation=gen_random_uuid() WHERE environment=\'production\'',
    'UPDATE page_studio_cms_scopes SET target=\'{}\' WHERE environment=\'production\'',
    'UPDATE page_studio_cms_scopes SET state=\'managed\' WHERE environment=\'staging\'',
    'UPDATE page_studio_managed_transfer_completions SET receipt_digest=repeat(\'0\',64)',
    'UPDATE page_studio_managed_transfer_intents SET intent_digest=repeat(\'0\',64)'
  ])('rejects inconsistent provenance or physical selection: %s', async (sql) => {
    await db.query(sql)
    await expect(read()).rejects.toThrow()
  })
  it('never uses a retained source for an ordinary editor', async () => {
    await expect(readManagedCmsOrigin(db, receipt.source.scope as never)).rejects.toThrow()
  })
})
