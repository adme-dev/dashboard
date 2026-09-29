import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeNativeImageOperation } from '~~/server/utils/pageStudio/imageGenerationService'
import { withImageGenerationAuthority } from '~~/server/utils/pageStudio/imageGenerationAuthority'
import { buildImageQuote } from '~~/server/utils/pageStudio/imageQuotes'
import { persistImageQuote } from '~~/server/utils/pageStudio/imageQuoteStore'
import type { ContentAuthorityRequest } from '~~/server/utils/pageStudio/businessContent'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'

vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: () => { throw new Error('Inject disposable transaction') },
  queryOneFresh: () => { throw new Error('Use transaction queries') }
}))
const url = process.env.PAGE_STUDIO_IMAGE_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== '55461' || target.pathname !== '/studio_cms_receipt' || target.search) throw new Error('Owned local image test database required')
}
describe.runIf(Boolean(url))('native image authority on PostgreSQL', () => {
  let pool: pg.Pool
  let schema: string
  let request: ContentAuthorityRequest
  const transaction = async <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => {
    const db = await pool.connect()
    try {
      await db.query('BEGIN')
      const result = await work(db)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    } finally { db.release() }
  }
  async function quote() {
    return withImageGenerationAuthority(request, true, async (db, context) => {
      const proposal = await buildImageQuote(context.config, context.scope, context.actor, {
        intentId: randomUUID(), prompt: 'Soft abstract linen', modelId: '@cf/black-forest-labs/flux-1-schnell', aspect: 'native'
      })
      return persistImageQuote(db, proposal)
    }, { runTransaction: transaction })
  }
  const count = async () => Number((await pool.query('SELECT count(*) FROM page_studio_image_quotes')).rows[0].count)
  beforeEach(async () => {
    schema = `image_auth_${randomUUID().replaceAll('-', '')}`
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    await admin.end()
    pool = new pg.Pool({ connectionString: url, max: 5, application_name: schema, options: `-c search_path=${schema},pg_catalog -c statement_timeout=6000` })
    await pool.query(`CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);`)
    for (const name of ['402_page_studio_control_plane.sql', '404_page_studio_documents.sql', '420_page_studio_login_sessions.sql', '438_page_studio_image_credits.sql', '439_page_studio_image_quotes.sql']) {
      await pool.query(readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8'))
    }
    const clientId = randomUUID(), userId = randomUUID(), hash = randomUUID().replaceAll('-', '').repeat(2)
    await pool.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    await pool.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'manager\')', [userId, clientId])
    const entitlement = (await pool.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,monthly_ai_operation_limit,active_site_limit)
      VALUES('image_test',$1,25,2) RETURNING id`, [clientId])).rows[0].id
    const siteId = (await pool.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version)
      VALUES('image_test',$1,$2,'Image site','image-site','fixture') RETURNING id`, [clientId, entitlement])).rows[0].id
    await pool.query('INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role) VALUES(\'image_test\',$1,$2,$3,\'editor\')', [clientId, siteId, userId])
    const login = (await pool.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('client',$1,$2,date_trunc('milliseconds',clock_timestamp())-INTERVAL '1hour',date_trunc('milliseconds',clock_timestamp())+INTERVAL '1day') RETURNING *`, [hash, userId])).rows[0]
    await pool.query('INSERT INTO client_sessions VALUES($1,$2,clock_timestamp()+INTERVAL \'1day\')', [hash, userId])
    request = { siteId, actor: { role: 'client', actorId: userId, clientId }, login: { role: 'client', userId, tokenHash: hash, issuedAt: login.issued_at, expiresAt: login.expires_at }, env: {
      PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: {},
      PAGE_STUDIO_IMAGE_CONFIG: JSON.stringify({ gatewayId: 'image-test', priceVersion: 'test-v1', models: [{ id: '@cf/black-forest-labs/flux-1-schnell', credits: 10 }],
        scopes: [{ tenantId: 'image_test', clientId, businessId: clientId, siteId, environment: 'staging' }] })
    } }
  })
  afterEach(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`)
      await pool.end()
    }
  })
  it('permits an entitled editor without granting billing authority', async () => {
    expect(await quote()).toMatchObject({ credits: 10, scope: { siteId: request.siteId }, actor: { actorId: request.actor.actorId } })
    const rights = await withImageGenerationAuthority(request, false, async (_db, context) => ({ edit: context.canGenerate, purchase: context.canPurchase }), { runTransaction: transaction })
    expect(rights).toEqual({ edit: true, purchase: false })
    expect(await count()).toBe(1)
  })
  it('allows a viewer to inspect costs but not create a quote', async () => {
    await pool.query('UPDATE page_studio_site_memberships SET role=\'viewer\'')
    expect(await withImageGenerationAuthority(request, false, async (_db, context) => context.canGenerate, { runTransaction: transaction })).toBe(false)
    await expect(quote()).rejects.toMatchObject({ statusCode: 403 })
    expect(await count()).toBe(0)
  })
  it.each([
    'UPDATE client_users SET status=\'inactive\'',
    'UPDATE client_sessions SET expires_at=clock_timestamp()-INTERVAL \'1second\'',
    'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_entitlements SET status=\'suspended\'',
    'UPDATE page_studio_entitlements SET monthly_ai_operation_limit=0',
    'DELETE FROM page_studio_site_memberships'
  ])('denies stale native authority with no quote: %s', async (sql) => {
    await pool.query(sql)
    await expect(quote()).rejects.toMatchObject({ statusCode: 403 })
    expect(await count()).toBe(0)
  })
  it('does not reveal another customer’s site', async () => {
    request.actor = { role: 'client', actorId: request.actor.actorId, clientId: randomUUID() }
    await expect(quote()).rejects.toMatchObject({ statusCode: 404 })
  })
  it('rolls back a quote if the entitlement expires before the final check', async () => {
    await expect(withImageGenerationAuthority(request, true, async (db, context) => {
      const proposal = await buildImageQuote(context.config, context.scope, context.actor, { intentId: randomUUID(), prompt: 'Abstract light', modelId: '@cf/black-forest-labs/flux-1-schnell', aspect: 'native' })
      await persistImageQuote(db, proposal)
      await db.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+INTERVAL \'100milliseconds\'')
      await db.query('SELECT pg_sleep(0.2)')
    }, { runTransaction: transaction })).rejects.toMatchObject({ statusCode: 403 })
    expect(await count()).toBe(0)
  })
  it('rechecks logout after waiting for the site mutation lock', async () => {
    const blocker = await pool.connect()
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM page_studio_sites FOR NO KEY UPDATE')
    try {
      const pending = quote()
      const rejected = expect(pending).rejects.toMatchObject({ statusCode: 403 })
      await vi.waitFor(async () => {
        const waiting = await pool.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type=\'Lock\'', [schema])
        expect(waiting.rows[0].count).toBeGreaterThan(0)
      }, { timeout: 2000 })
      await pool.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      await blocker.query('COMMIT')
      await rejected
      expect(await count()).toBe(0)
    } finally {
      await blocker.query('ROLLBACK')
      blocker.release()
    }
  })
  it('serves costs, wallet and a durable public quote without exposing internal authority', async () => {
    const deps = { runTransaction: transaction }
    const catalog = await executeNativeImageOperation(request, 'catalog', {}, deps)
    expect(catalog).toMatchObject({ canGenerate: true, canPurchase: false, balance: { available: 0 }, models: [{ credits: 10 }] })
    const body = { intentId: randomUUID(), prompt: 'Soft abstract linen', modelId: '@cf/black-forest-labs/flux-1-schnell', aspect: 'native' }
    const first = await executeNativeImageOperation(request, 'quote', body, deps)
    expect(first).toMatchObject({ quote: { credits: 10, prompt: body.prompt } })
    expect(first.quote).not.toHaveProperty('scope')
    expect(first.quote).not.toHaveProperty('gatewayId')
    expect(await executeNativeImageOperation(request, 'quote', body, deps)).toEqual(first)
    expect(await executeNativeImageOperation(request, 'account', { limit: 10 }, deps)).toMatchObject({ history: { items: [] } })
  })
  it('keeps account receipts readable when generation is disabled', async () => {
    await pool.query('INSERT INTO page_studio_image_wallets(tenant_id,client_id,environment,balance) VALUES(\'image_test\',$1,\'staging\',100)', [request.actor.role === 'client' ? request.actor.clientId : ''])
    delete request.env.PAGE_STUDIO_IMAGE_CONFIG
    const deps = { runTransaction: transaction }
    expect(await executeNativeImageOperation(request, 'catalog', {}, deps)).toMatchObject({ models: [], canGenerate: false, balance: { available: 100 } })
    expect(await executeNativeImageOperation(request, 'account', {}, deps)).toMatchObject({ balance: { balance: 100 }, history: { items: [] } })
    await expect(quote()).rejects.toMatchObject({ statusCode: 503 })
  })
  it('does not require content editing to identify a customer billing owner', async () => {
    await pool.query('UPDATE client_users SET role=\'admin\'')
    await pool.query('UPDATE page_studio_site_memberships SET role=\'viewer\'')
    expect(await executeNativeImageOperation(request, 'catalog', {}, { runTransaction: transaction })).toMatchObject({ canPurchase: true, canGenerate: false })
  })
  it('rechecks staff edit permission rather than trusting the HTTP actor hint', async () => {
    const actorId = request.actor.actorId
    const roleId = randomUUID()
    await pool.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [actorId])
    await pool.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [roleId])
    await pool.query('INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_EDIT\'),($1,\'PAGE_STUDIO_VIEW\')', [roleId])
    await pool.query('INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at) VALUES(\'agency\',$1,$2,$3,$4)', [request.login.tokenHash, actorId, request.login.issuedAt, request.login.expiresAt])
    request.actor = { role: 'agency', actorId, tenantId: 'image_test', canEdit: true }
    request.login = { ...request.login, role: 'agency' }
    expect(await quote()).toMatchObject({ actor: { actorRole: 'agency' } })
    await pool.query('DELETE FROM role_permission_groups WHERE permission_group=\'PAGE_STUDIO_EDIT\'')
    await expect(quote()).rejects.toMatchObject({ statusCode: 403 })
    expect(await count()).toBe(1)
  })
  it('does not return billing-only data after the customer owner role is revoked', async () => {
    await pool.query('UPDATE client_users SET role=\'admin\'')
    await expect(withImageGenerationAuthority(request, false, async () => {
      await pool.query('UPDATE client_users SET role=\'manager\'')
      return { privateBillingReceipt: 'customer-wide history' }
    }, { runTransaction: transaction })).rejects.toMatchObject({ statusCode: 403 })
  })
})
