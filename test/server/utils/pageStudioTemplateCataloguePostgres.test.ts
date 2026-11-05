import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPermittedTemplates, templateCatalogueQuery, type TemplateActor } from '~~/server/utils/pageStudio/templateCatalogue'

vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: () => {
  throw new Error('Disposable database required')
} }))
const url = process.env.PAGE_STUDIO_TEMPLATE_CATALOGUE_DATABASE_TEST_URL
if (url) {
  const value = new URL(url)
  if (!['postgres:', 'postgresql:'].includes(value.protocol) || !['localhost', '127.0.0.1'].includes(value.hostname) || !/^\/studio_template_catalogue(?:_[a-z0-9_]+)?$/.test(value.pathname) || value.search) throw new Error('Disposable localhost catalogue database required')
}
const id = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const hash = 'a'.repeat(64)
let db: pg.Client
let schema: string
const actors: TemplateActor[] = [{ kind: 'agency', tenantId: 'owner', userId: id, sessionIdentity: hash }, { kind: 'portal', tenantId: 'recipient', clientId: id, userId: id, sessionIdentity: hash }, { kind: 'customer', workspaceId: id, identityId: id, sessionIdentity: hash }]
const list = async (actor: TemplateActor) => {
  const q = templateCatalogueQuery(actor, undefined, 20)
  return (await db.query(q.sql, q.params)).rows
}
describe.skipIf(!url)('template catalogue real PostgreSQL', () => {
  beforeEach(async () => {
    db = new pg.Client({ connectionString: url })
    await db.connect()
    schema = `catalogue_${randomUUID().replaceAll('-', '')}`
    await db.query(`CREATE SCHEMA ${schema};
SET search_path TO ${schema}`)
    await db.query(`CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT);
      CREATE TABLE client_sessions(client_user_id UUID,token_hash TEXT,expires_at TIMESTAMPTZ);
      CREATE TABLE page_studio_entitlements(tenant_id TEXT,client_id UUID,status TEXT,portal_creation_enabled BOOLEAN,effective_from TIMESTAMPTZ,effective_until TIMESTAMPTZ);
      CREATE TABLE page_studio_customer_workspaces(id UUID PRIMARY KEY,status TEXT);
      CREATE TABLE page_studio_workspace_memberships(workspace_id UUID,identity_id UUID,role TEXT,revoked_at TIMESTAMPTZ,expires_at TIMESTAMPTZ);
      CREATE TABLE page_studio_customer_identities(id UUID PRIMARY KEY,status TEXT,issuer TEXT,subject TEXT,portal_user_id UUID,verified_at TIMESTAMPTZ);
      CREATE TABLE page_studio_customer_accounts(id UUID PRIMARY KEY,identity_id UUID,status TEXT);
      CREATE TABLE page_studio_customer_sessions(account_id UUID,token_hash TEXT,revoked_at TIMESTAMPTZ,expires_at TIMESTAMPTZ);
      CREATE TABLE page_studio_workspace_client_bindings(workspace_id UUID);
      CREATE TABLE page_studio_checkpoints(tenant_id TEXT,client_id UUID,site_id UUID,id TEXT,UNIQUE(tenant_id,client_id,site_id,id));`)
    await db.query(`INSERT INTO page_studio_checkpoints VALUES ('owner','${id}','${id}','cp')`)
    await db.query(readFileSync('server/database/migrations/501_page_studio_template_catalogue.sql', 'utf8'))
    await db.query(`CREATE TABLE page_studio_sites(id UUID PRIMARY KEY,tenant_id TEXT,client_id UUID,status TEXT,UNIQUE(tenant_id,client_id,id));
      CREATE TABLE page_studio_staging_deployments(id UUID PRIMARY KEY);
      CREATE TABLE page_studio_business_owners(id UUID PRIMARY KEY,workspace_id UUID,agency_client_id UUID);`)
    await db.query(readFileSync('server/database/migrations/502_page_studio_template_operations.sql', 'utf8'))
    await db.query(`INSERT INTO agency_clients VALUES ('${id}',TRUE),('${other}',TRUE);
      INSERT INTO team_members VALUES ('${id}',TRUE);
      INSERT INTO client_users VALUES ('${id}','${id}','active');
      INSERT INTO client_sessions VALUES ('${id}','${hash}',clock_timestamp()+interval '1 day');
      INSERT INTO page_studio_entitlements VALUES ('recipient','${id}','active',TRUE,clock_timestamp()-interval '1 day',NULL);
      INSERT INTO page_studio_customer_workspaces VALUES ('${id}','active'),('${other}','active');
      INSERT INTO page_studio_customer_identities VALUES ('${id}','active','studio','${id}',NULL,clock_timestamp());
      INSERT INTO page_studio_customer_accounts VALUES ('${id}','${id}','active');
      INSERT INTO page_studio_customer_sessions VALUES ('${id}','${hash}',NULL,clock_timestamp()+interval '1 day');
      INSERT INTO page_studio_workspace_memberships VALUES ('${id}','${id}','viewer',NULL,NULL);
      INSERT INTO page_studio_template_entries(id,owner_tenant_id,slug,name) VALUES ('${id}','owner','kia','Kia');
      INSERT INTO page_studio_template_versions(id,template_id,format,source_tenant_id,source_client_id,source_site_id,source_checkpoint_id,source_digest,inventory_digest,provenance)
      VALUES ('${id}','${id}','typed','owner','${id}','${id}','cp','${hash}','${hash}','{}');
      INSERT INTO page_studio_template_version_status(version_id) VALUES ('${id}');
      INSERT INTO page_studio_template_grants(template_id,audience,tenant_id,client_id) VALUES ('${id}','portal-client','recipient','${id}');
      INSERT INTO page_studio_template_grants(template_id,audience,workspace_id) VALUES ('${id}','customer-workspace','${id}');`)
    await db.query(`ALTER TABLE client_users ADD COLUMN role TEXT DEFAULT 'viewer';
      ALTER TABLE page_studio_entitlements ADD COLUMN active_site_limit INTEGER DEFAULT 1;
      ALTER TABLE page_studio_entitlements ADD COLUMN plan_key TEXT DEFAULT 'standard';
      ALTER TABLE page_studio_entitlements ADD COLUMN plan_metadata JSONB DEFAULT '{}'::jsonb;`)
  })
  afterEach(async () => {
    if (db) {
      await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await db.end()
    }
  })
  it.each(actors)('allows correct $kind authority including read-only viewer', async (actor) => {
    expect(await list(actor)).toHaveLength(1)
  })
  it('defaults private and never treats published eligibility as an explicit grant', async () => {
    await db.query(`DELETE FROM page_studio_template_grants;
UPDATE page_studio_template_entries SET visibility='published-eligible';
UPDATE page_studio_template_version_status SET published_eligible=TRUE`)
    await db.query(`INSERT INTO page_studio_template_grants(template_id,audience) VALUES ('${id}','published-page-studio')`)
    expect(await list(actors[1]!)).toEqual([])
    expect(await list(actors[2]!)).toEqual([])
  })
  it.each([
    'UPDATE page_studio_template_grants SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_template_grants SET effective_from=clock_timestamp()-interval \'2 days\',expires_at=clock_timestamp()-interval \'1 day\'',
    'UPDATE page_studio_template_entries SET withdrawn_at=clock_timestamp()',
    'UPDATE page_studio_template_version_status SET withdrawn_at=clock_timestamp()'
  ])('refuses revoked, expired or withdrawn grants: %s', async (sql) => {
    await db.query(sql)
    expect(await list(actors[1]!)).toEqual([])
    expect(await list(actors[2]!)).toEqual([])
  })
  it('denies foreign account and agency scopes', async () => {
    expect(await list({ ...actors[0]!, kind: 'agency', userId: id, tenantId: 'other' })).toEqual([])
    expect(await list({ kind: 'portal', tenantId: 'recipient', clientId: other, userId: id, sessionIdentity: hash })).toEqual([])
    expect(await list({ kind: 'customer', workspaceId: other, identityId: id, sessionIdentity: hash })).toEqual([])
  })
  it('denies expired portal entitlement and customer membership', async () => {
    await db.query(`UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-interval '1 second';
UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()-interval '1 second'`)
    expect(await list(actors[1]!)).toEqual([])
    expect(await list(actors[2]!)).toEqual([])
  })
  it('denies revoked or expired original sessions', async () => {
    await db.query(`UPDATE client_sessions SET expires_at=clock_timestamp()-interval '1 second';
UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()`)
    expect(await list(actors[1]!)).toEqual([])
    expect(await list(actors[2]!)).toEqual([])
  })
  it('makes version bytes append-only and prevents deleting referenced source', async () => {
    await expect(db.query('UPDATE page_studio_template_versions SET source_digest=repeat(\'b\',64)')).rejects.toThrow('TEMPLATE_VERSION_IMMUTABLE')
    await expect(db.query('DELETE FROM page_studio_template_versions')).rejects.toThrow('TEMPLATE_VERSION_IMMUTABLE')
    await expect(db.query('DELETE FROM page_studio_checkpoints')).rejects.toThrow()
  })
  it('refuses cascading truncate and retains immutable versions and their status', async () => {
    const versions = (await db.query('SELECT * FROM page_studio_template_versions ORDER BY id')).rows
    const statuses = (await db.query('SELECT * FROM page_studio_template_version_status ORDER BY version_id')).rows
    expect(versions).toHaveLength(1)
    expect(statuses).toHaveLength(1)
    await expect(db.query('TRUNCATE page_studio_template_versions CASCADE')).rejects.toThrow('TEMPLATE_VERSION_IMMUTABLE')
    expect((await db.query('SELECT * FROM page_studio_template_versions ORDER BY id')).rows).toEqual(versions)
    expect((await db.query('SELECT * FROM page_studio_template_version_status ORDER BY version_id')).rows).toEqual(statuses)
  })
  it('rejects malformed grant scope and missing version source', async () => {
    await expect(db.query(`INSERT INTO page_studio_template_grants(template_id,audience,workspace_id,client_id) VALUES ('${id}','customer-workspace','${id}','${id}')`)).rejects.toThrow()
    await expect(db.query(`INSERT INTO page_studio_template_versions(template_id,format,source_tenant_id,source_client_id,source_site_id,source_checkpoint_id,source_digest,inventory_digest,provenance) VALUES ('${id}','typed','other','${id}','${id}','missing','${hash}','${hash}','{}')`)).rejects.toThrow()
  })
  it('observes a withdrawal committed by another connection during authority refresh', async () => {
    const actor = actors[1]!
    const result = await listPermittedTemplates(actor, {}, {
      query: async (sql, params) => (await db.query(sql, params)).rows,
      reauthorize: async () => {
        const otherConnection = new pg.Client({ connectionString: url })
        await otherConnection.connect()
        try {
          await otherConnection.query(`UPDATE ${schema}.page_studio_template_grants SET revoked_at=clock_timestamp()`)
        } finally {
          await otherConnection.end()
        }
        return actor
      }
    })
    expect(result.items).toEqual([])
  })
  it.each([null, {}, { formatVersion: 1, kind: 'code-pages', operationId: 123, indexDigest: hash, contentDigest: hash }])('rejects incomplete or wrongly typed code binding: %j', async (binding) => {
    await expect(db.query(`INSERT INTO page_studio_template_versions(template_id,format,source_tenant_id,source_client_id,source_site_id,source_checkpoint_id,source_digest,inventory_digest,provenance,code_content)
      VALUES ($1,'code-pages','owner',$1,$1,'cp',$2,$2,'{}',$3)`, [id, 'b'.repeat(64), JSON.stringify(binding)])).rejects.toThrow()
  })
  it('retains the pre-migration source checkpoint unchanged', async () => {
    expect((await db.query('SELECT * FROM page_studio_checkpoints')).rows).toEqual([{ tenant_id: 'owner', client_id: id, site_id: id, id: 'cp' }])
  })

  it('lists explicitly granted viewers when site creation is disabled', async () => {
    await db.query('UPDATE page_studio_entitlements SET portal_creation_enabled=FALSE')
    expect(await list(actors[1]!)).toHaveLength(1)
  })
})
