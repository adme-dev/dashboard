import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { lockPublishedFeatureSite } from '~~/server/utils/pageStudio/publishedFeatureAuthority'
import { lockPublishedSiteOwner } from '~~/server/utils/pageStudio/publishedSiteOwner'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (url.hostname !== '127.0.0.1' || !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Disposable PG required')
}
describe.runIf(Boolean(databaseUrl))('published native site ownership', () => {
  let db: pg.Client
  const schema = `published_owner_${randomUUID().replaceAll('-', '')}`, business = randomUUID(), site = randomUUID(), workspace = randomUUID(), identity = randomUUID(), account = randomUUID()
  const scope = { tenantId: `studio-customer-${business}`, clientId: business, siteId: site }
  beforeAll(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema},pg_catalog;
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE page_studio_business_owners(id UUID PRIMARY KEY,workspace_id UUID,agency_client_id UUID);
      CREATE TABLE page_studio_customer_workspaces(id UUID PRIMARY KEY,status TEXT);
      CREATE TABLE page_studio_customer_site_requests(site_id UUID PRIMARY KEY,workspace_id UUID,business_id UUID,tenant_id TEXT);
      CREATE TABLE page_studio_workspace_memberships(workspace_id UUID,identity_id UUID,role TEXT,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
      CREATE TABLE page_studio_customer_identities(id UUID PRIMARY KEY,status TEXT,issuer TEXT,subject TEXT,portal_user_id UUID,verified_at TIMESTAMPTZ);
      CREATE TABLE page_studio_customer_accounts(id UUID PRIMARY KEY,identity_id UUID,status TEXT);
      CREATE TABLE page_studio_workspace_client_bindings(workspace_id UUID,client_id UUID);
      CREATE TABLE page_studio_sites(id UUID,tenant_id TEXT,client_id UUID,entitlement_id UUID,status TEXT,current_release_id UUID);
      CREATE TABLE page_studio_entitlements(id UUID,tenant_id TEXT,client_id UUID,status TEXT,plan_metadata JSONB,effective_from TIMESTAMPTZ,effective_until TIMESTAMPTZ,active_site_limit INT);
      CREATE TABLE page_studio_release_pointers(tenant_id TEXT,client_id UUID,site_id UUID,environment TEXT,normalized_hostname TEXT,active_release_id UUID,pointer_version INT);`)
  })
  beforeEach(async () => {
    await db.query('TRUNCATE page_studio_sites,page_studio_entitlements,page_studio_release_pointers,agency_clients,page_studio_business_owners,page_studio_customer_workspaces,page_studio_customer_site_requests,page_studio_workspace_memberships,page_studio_customer_identities,page_studio_customer_accounts,page_studio_workspace_client_bindings')
    await db.query('INSERT INTO page_studio_business_owners VALUES($1,$2,NULL)', [business, workspace])
    await db.query('INSERT INTO page_studio_customer_workspaces VALUES($1,\'active\')', [workspace])
    await db.query('INSERT INTO page_studio_customer_site_requests VALUES($1,$2,$3,$4)', [site, workspace, business, scope.tenantId])
    await db.query('INSERT INTO page_studio_workspace_memberships VALUES($1,$2,\'owner\',NULL,NULL)', [workspace, identity])
    await db.query('INSERT INTO page_studio_customer_identities VALUES($1,\'active\',\'studio\',$2,NULL,clock_timestamp())', [identity, account])
    await db.query('INSERT INTO page_studio_customer_accounts VALUES($1,$2,\'active\')', [account, identity])
  })
  afterAll(async () => {
    if (!db) return
    await db.query(`DROP SCHEMA ${schema} CASCADE`)
    await db.end()
  })
  it('admits a native public owner without any human login session', async () => {
    await expect(lockPublishedSiteOwner(db, scope)).resolves.toBeUndefined()
  })
  it('admits a native published site through the complete current site and package fence without login tables', async () => {
    const entitlementId = randomUUID(), releaseId = randomUUID(), published = { hostname: 'native.example.com', releaseId }
    await db.query('INSERT INTO page_studio_sites VALUES($1,$2,$3,$4,\'active\',$5)', [site, scope.tenantId, business, entitlementId, releaseId])
    await db.query(`INSERT INTO page_studio_entitlements VALUES($1,$2,$3,'active','{"builder":{"collectionSchemas":true}}',clock_timestamp()-interval '1hour',NULL,1)`, [entitlementId, scope.tenantId, business])
    await db.query(`INSERT INTO page_studio_release_pointers VALUES($1,$2,$3,'production',$4,$5,1)`, [scope.tenantId, business, site, published.hostname, releaseId])
    const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }
    expect(await lockPublishedFeatureSite(db, published, env)).toEqual({ scope, releaseEnvironment: 'production', epoch: 1 })
    await db.query(`UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-interval '1second'`)
    await expect(lockPublishedFeatureSite(db, published, env)).rejects.toThrow()
  })
  it.each([
    'UPDATE page_studio_customer_accounts SET status=\'suspended\'',
    'UPDATE page_studio_customer_identities SET status=\'suspended\'',
    'UPDATE page_studio_customer_workspaces SET status=\'suspended\'',
    'UPDATE page_studio_workspace_memberships SET role=\'viewer\'',
    'UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()-interval \'1second\'',
    'UPDATE page_studio_customer_identities SET verified_at=NULL',
    'UPDATE page_studio_customer_identities SET subject=\'other-account\'',
    'UPDATE page_studio_customer_site_requests SET tenant_id=\'other_tenant\'',
    'UPDATE page_studio_customer_site_requests SET site_id=gen_random_uuid()',
    'INSERT INTO page_studio_workspace_client_bindings SELECT workspace_id,id FROM page_studio_business_owners'
  ])('denies invalid current native ownership: %s', async (sql) => {
    await db.query(sql)
    await expect(lockPublishedSiteOwner(db, scope)).rejects.toThrow()
  })
  it('preserves existing active agency ownership and rejects inactive agencies', async () => {
    await db.query('DELETE FROM page_studio_business_owners')
    await db.query('INSERT INTO agency_clients VALUES($1,TRUE)', [business])
    await expect(lockPublishedSiteOwner(db, { ...scope, tenantId: 'agency_tenant' })).resolves.toBeUndefined()
    await db.query('UPDATE agency_clients SET is_active=FALSE')
    await expect(lockPublishedSiteOwner(db, scope)).rejects.toThrow()
  })
})
