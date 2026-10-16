import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (url.hostname !== '127.0.0.1' || !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname) || url.search) throw new Error('Disposable PG required')
}
describe.runIf(Boolean(databaseUrl))('terminal transfer database invariants', () => {
  let db: pg.Client
  const schema = `terminal_${randomUUID().replaceAll('-', '')}`, business = randomUUID(), site = randomUUID()
  const source = { tenantId: 'terminal_test', clientId: business, businessId: business, siteId: site, environment: 'staging' }
  const destination = { ...source, environment: 'production' }
  const key = (scope: typeof source) => JSON.stringify([scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment])
  const sourceKey = key(source), destinationKey = key(destination)
  let operation: string, sourceGeneration: string, destinationGeneration: string, sourceApp: string, destinationApp: string, audit: string
  const hash = 'a'.repeat(64), copyHash = 'b'.repeat(64), historyHash = 'c'.repeat(64)
  const target = (name: string) => ({ accountId: 'a'.repeat(32), databaseId: name, name, routeId: name })
  beforeAll(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema},pg_catalog;
      CREATE TABLE page_studio_sites(tenant_id TEXT,client_id UUID,id UUID,current_checkpoint_id TEXT,UNIQUE(tenant_id,client_id,id));
      CREATE TABLE page_studio_audit_events(tenant_id TEXT,client_id UUID,site_id UUID,id UUID,UNIQUE(tenant_id,client_id,site_id,id));
      CREATE TABLE page_studio_checkpoints(tenant_id TEXT,client_id UUID,site_id UUID,id TEXT,digest TEXT,UNIQUE(tenant_id,client_id,site_id,id));
      CREATE TABLE page_studio_managed_transfer_intents(operation_id UUID PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,source_scope_key TEXT,source_generation UUID,destination_generation UUID,intent_digest TEXT,intent JSONB);
      CREATE TABLE page_studio_managed_transfer_copy_graph_requests(operation_id UUID PRIMARY KEY,request JSONB);
      CREATE TABLE page_studio_managed_transfer_copy_graph_verifications(operation_id UUID PRIMARY KEY,intent_digest TEXT,proof_digest TEXT,proof JSONB);
      CREATE TABLE page_studio_managed_transfer_forms_history_verifications(operation_id UUID PRIMARY KEY,intent_digest TEXT,receipt_digest TEXT,receipt JSONB);
      CREATE FUNCTION page_studio_managed_transfer_intent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable'; END $$;`)
    for (const name of ['422_page_studio_cms_visibility.sql', '425_page_studio_cms_authoring_scope.sql', '471_page_studio_managed_transfer_completions.sql']) {
      await db.query(readFileSync(`server/database/migrations/${name}`, 'utf8'))
    }
  })
  beforeEach(async () => {
    await db.query('TRUNCATE page_studio_sites,page_studio_audit_events,page_studio_checkpoints,page_studio_managed_transfer_intents,page_studio_managed_transfer_copy_graph_requests,page_studio_managed_transfer_copy_graph_verifications,page_studio_managed_transfer_forms_history_verifications CASCADE')
    operation = randomUUID()
    sourceGeneration = randomUUID()
    destinationGeneration = randomUUID()
    sourceApp = randomUUID()
    destinationApp = randomUUID()
    audit = randomUUID()
    await db.query('INSERT INTO page_studio_sites VALUES($1,$2,$3,\'source_cp\')', [source.tenantId, business, site])
    await db.query('INSERT INTO page_studio_audit_events VALUES($1,$2,$3,$4)', [source.tenantId, business, site, audit])
    await db.query(`INSERT INTO page_studio_checkpoints VALUES($1,$2,$3,'source_cp',$4),($1,$2,$3,'destination_cp',$4)`, [source.tenantId, business, site, hash])
    await db.query(`INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,active_generation,target,freeze_digest)
      VALUES($1,$2,$3,$3,$4,'staging','legacy','original',$5,$6,$7)`, [sourceKey, source.tenantId, business, site, sourceGeneration, target('source'), hash])
    await db.query(`INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,adoption_id) VALUES($1,$2,$3,$4,$5,'original')`, [sourceKey, sourceGeneration, sourceApp, hash, { checkpoint: { id: 'source_cp', digest: hash } }])
    await db.query(`UPDATE page_studio_cms_scopes SET state='managed',current_application_id=$2 WHERE scope_key=$1`, [sourceKey, sourceApp])
    const intent = { authority: { source, destination }, source: { context: { state: { target: target('source'), freeze_digest: hash, current_content_id: null }, application: { id: sourceApp, digest: hash } }, checkpoint: { id: 'source_cp', digest: hash } } }
    await db.query('INSERT INTO page_studio_managed_transfer_intents VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [operation, source.tenantId, business, site, sourceKey, sourceGeneration, destinationGeneration, hash, intent])
    const destinationGraph = { scope: destination, target: target('destination'), freezeDigest: hash, generation: destinationGeneration, applicationId: destinationApp, checkpointId: 'destination_cp' }
    const base = { application: { manifest: { checkpoint: { id: 'destination_cp', digest: hash } }, digest: hash }, checkpoint: { id: 'destination_cp', digest: hash }, content: { pin: null } }
    await db.query('INSERT INTO page_studio_managed_transfer_copy_graph_requests VALUES($1,$2)', [operation, { destinationGraph, objectIds: [] }])
    await db.query('INSERT INTO page_studio_managed_transfer_copy_graph_verifications VALUES($1,$2,$3,$4)', [operation, hash, copyHash, { graphReceipt: { graph: { base } } }])
    await db.query('INSERT INTO page_studio_managed_transfer_forms_history_verifications VALUES($1,$2,$3,$4)', [operation, hash, historyHash, { destination: { scope: destination, target: target('destination') } }])
  })
  afterAll(async () => {
    if (db) {
      await db.query('ROLLBACK')
      await db.query(`DROP SCHEMA ${schema} CASCADE`)
      await db.end()
    }
  })
  async function prepare(changes: Record<string, unknown> = {}, destinationChange?: string) {
    const endpoint = (scope: typeof source, generation: string, application: string, name: string) => ({ scope, generation, target: target(name), freezeDigest: hash, application: { id: application, digest: hash }, checkpoint: { id: `${name}_cp`, digest: hash }, contentId: null })
    const body = { formatVersion: 1, operationId: operation, intentDigest: hash, copyProofDigest: copyHash, historyReceiptDigest: historyHash,
      source: endpoint(source, sourceGeneration, sourceApp, 'source'), destination: endpoint(destination, destinationGeneration, destinationApp, 'destination'), auditId: audit, completedAt: new Date().toISOString(), ...changes }
    if (destinationChange === 'target') body.destination.target = target('other_destination')
    if (destinationChange === 'freeze') body.destination.freezeDigest = 'e'.repeat(64)
    if (destinationChange === 'checkpoint') {
      body.destination.checkpoint.id = 'other_cp'
      await db.query('INSERT INTO page_studio_checkpoints VALUES($1,$2,$3,\'other_cp\',$4)', [source.tenantId, business, site, hash])
    }
    const receipt = { ...body, digest: await collectionDigest(body) }, json = collectionCanonical(receipt)
    await db.query(`INSERT INTO page_studio_managed_transfer_completions(operation_id,intent_digest,source_scope_key,source_generation,destination_scope_key,destination_generation,copy_proof_digest,history_receipt_digest,receipt,receipt_json,receipt_digest,audit_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [operation, hash, sourceKey, sourceGeneration, destinationKey, destinationGeneration, body.copyProofDigest, body.historyReceiptDigest, receipt, json, receipt.digest, audit])
    await db.query(`UPDATE page_studio_cms_scopes SET state='retained',retained_by_transfer_id=$2 WHERE scope_key=$1`, [sourceKey, operation])
    await db.query(`INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,transfer_id,active_generation,target,freeze_digest,current_application_id)
      VALUES($1,$2,$3,$3,$4,'production','managed',$5,$6,$7,$8,$9)`, [destinationKey, source.tenantId, business, site, operation, destinationGeneration, body.destination.target, body.destination.freezeDigest, destinationApp])
    await db.query(`INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,transfer_id) VALUES($1,$2,$3,$4,$5,$6)`, [destinationKey, destinationGeneration, destinationApp, hash, { checkpoint: body.destination.checkpoint }, operation])
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=$1', [body.destination.checkpoint.id])
    return receipt
  }
  async function atomic(work: () => Promise<unknown>) {
    await db.query('BEGIN')
    try {
      const result = await work()
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }
  it('atomically retains original provenance and selects an explicitly transferred production generation', async () => {
    await atomic(() => prepare())
    expect((await db.query('SELECT state,adoption_id,transfer_id,retained_by_transfer_id FROM page_studio_cms_scopes ORDER BY environment')).rows).toEqual([
      { state: 'managed', adoption_id: null, transfer_id: operation, retained_by_transfer_id: null },
      { state: 'retained', adoption_id: 'original', transfer_id: null, retained_by_transfer_id: operation }
    ])
  })
  it.each(['copyProofDigest', 'historyReceiptDigest'])('rejects a substituted verified proof and rolls back selection: %s', async (field) => {
    await expect(atomic(() => prepare({ [field]: 'd'.repeat(64) }))).rejects.toThrow()
    expect((await db.query('SELECT state FROM page_studio_cms_scopes')).rows).toEqual([{ state: 'managed' }])
  })
  it('rejects a missing checkpoint switch and rolls back the whole handoff', async () => {
    await expect(atomic(async () => {
      await prepare()
      await db.query(`UPDATE page_studio_sites SET current_checkpoint_id='source_cp'`)
    })).rejects.toThrow()
    expect((await db.query('SELECT count(*) FROM page_studio_managed_transfer_completions')).rows[0].count).toBe('0')
  })
  it.each([
    `UPDATE page_studio_cms_scopes SET state='managed' WHERE environment='staging'`,
    `UPDATE page_studio_cms_scopes SET retained_by_transfer_id=NULL WHERE environment='staging'`,
    `UPDATE page_studio_cms_scopes SET target='{}' WHERE environment='staging'`,
    `UPDATE page_studio_cms_scopes SET transfer_id=NULL,adoption_id='fake' WHERE environment='production'`,
    `UPDATE page_studio_cms_scopes SET active_generation=gen_random_uuid() WHERE environment='production'`,
    `UPDATE page_studio_managed_transfer_completions SET receipt_digest=repeat('f',64)`,
    `DELETE FROM page_studio_managed_transfer_completions`,
    `DELETE FROM page_studio_cms_scopes WHERE environment='staging'`
  ])('prevents provenance erasure or source reopening: %s', async (sql) => {
    await atomic(() => prepare())
    await expect(db.query(sql)).rejects.toThrow()
  })
  it('rejects a substituted destination identity even when the terminal receipt is internally consistent', async () => {
    destinationApp = randomUUID()
    await expect(atomic(() => prepare())).rejects.toThrow()
  })
  it.each(['target', 'freeze', 'checkpoint'])('rejects substituted destination %s despite an internally consistent terminal receipt', async (field) => {
    await expect(atomic(() => prepare({}, field))).rejects.toThrow()
  })
  it('rejects source content that diverges from the original intent', async () => {
    await expect(atomic(async () => {
      await prepare()
      await db.query(`UPDATE page_studio_cms_scopes SET current_content_id=gen_random_uuid() WHERE environment='staging'`)
    })).rejects.toThrow()
    expect((await db.query('SELECT count(*) FROM page_studio_managed_transfer_completions')).rows[0].count).toBe('0')
  })
  it('rejects retained scopes that bypass their composite foreign key with null generation', async () => {
    await atomic(() => prepare())
    const preview = { ...source, environment: 'preview' }
    await expect(db.query(`INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,target,retained_by_transfer_id)
      VALUES($1,$2,$3,$3,$4,'preview','retained','forged',$5,$6)`, [key(preview), source.tenantId, business, site, target('forged'), operation])).rejects.toThrow()
  })
  it('permits genuine new destination commits and application selection after handoff', async () => {
    await atomic(() => prepare())
    const commit = randomUUID(), app = randomUUID()
    await atomic(async () => {
      await db.query(`INSERT INTO page_studio_cms_commits(scope_key,generation,tenant_id,client_id,site_id,id,operation_id,request_digest,prepared_digest,request,result,actor_id,audit_id)
        VALUES($1,$2,$3,$4,$5,$6,'new_edit',$7,$7,'{}','{}','editor',$8)`, [destinationKey, destinationGeneration, source.tenantId, business, site, commit, hash, audit])
      await db.query(`INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,previous_application_id,commit_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [destinationKey, destinationGeneration, app, hash, { checkpoint: { id: 'future_draft', digest: hash } }, destinationApp, commit])
      await db.query('UPDATE page_studio_cms_scopes SET current_application_id=$2 WHERE scope_key=$1', [destinationKey, app])
      await db.query(`UPDATE page_studio_sites SET current_checkpoint_id='future_draft'`)
    })
    expect((await db.query(`SELECT current_application_id FROM page_studio_cms_scopes WHERE environment='production'`)).rows[0].current_application_id).toBe(app)
  })
})
