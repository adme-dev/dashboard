import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')

describe.runIf(Boolean(databaseUrl))('native default discovery and form adapter races on disposable PostgreSQL', () => {
  const schema = `customer_form_adapters_${randomUUID().replaceAll('-', '')}`
  const staffId = randomUUID()
  let db: pg.Client
  let signup: typeof import('~~/server/utils/pageStudio/customerSignup')
  let workspaces: typeof import('~~/server/utils/pageStudio/customerWorkspaces')
  let sites: typeof import('~~/server/utils/pageStudio/customerSites')
  let owner: { sessionToken: string, identityId: string }
  let member: { sessionToken: string, identityId: string }
  let fixture: { workspaceId: string, businessId: string, tenantId: string, site: { id: string } }
  const runTransaction = async <T>(callback: (client: pg.Client) => Promise<T>) => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { await client.end() }
  }
  const login = async (email: string, mode: 'signup' | 'signin' = 'signup') => {
    const delivery = await signup.requestCustomerSignIn({ email, name: 'Native customer', mode, acceptedTerms: true }, 'preview-v1', runTransaction)
    return signup.verifyCustomerSignIn(delivery!.token, runTransaction)
  }
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL);
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID REFERENCES agency_clients(id), status TEXT, role TEXT);
      CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL);
      CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT);
      CREATE TABLE role_permission_groups (role_id UUID, permission_group TEXT, UNIQUE (role_id, permission_group));
    `)
    for (const name of ['402_page_studio_control_plane.sql', '442_page_studio_customer_workspaces.sql',
      '443_page_studio_customer_signup.sql', '444_page_studio_customer_site_ownership.sql']) await db.query(migration(name))
    signup = await import('~~/server/utils/pageStudio/customerSignup')
    workspaces = await import('~~/server/utils/pageStudio/customerWorkspaces')
    sites = await import('~~/server/utils/pageStudio/customerSites')
  })
  beforeEach(async () => {
    await db.query('TRUNCATE agency_clients, team_members, page_studio_customer_identities CASCADE')
    await db.query('INSERT INTO team_members VALUES ($1, TRUE)', [staffId])
    owner = await login('owner@example.test')
    member = await login('member@example.test')
    const workspace = await workspaces.createCustomerWorkspace({ identityId: owner.identityId, requestId: randomUUID(), name: 'Flowers' }, runTransaction)
    fixture = await sites.createCustomerPreviewSite({ workspaceId: workspace.workspace.id, identityId: owner.identityId,
      requestId: randomUUID(), name: 'Flowers preview', route: 'flowers', starterVersion: 'floristry-v1' }, {
      runTransaction, previewPolicy: { approvalId: randomUUID(), approvedBy: staffId,
        expiresAt: new Date(Date.now() + 86400_000).toISOString(), pagesPerSiteLimit: 5,
        storageBytesLimit: 104857600, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 1073741824 }
    })
    await db.query(`INSERT INTO page_studio_workspace_memberships (workspace_id, identity_id, role) VALUES ($1, $2, 'editor')`, [fixture.workspaceId, member.identityId])
  })
  afterAll(async () => {
    if (!db) return
    await db.query('ROLLBACK')
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  const contextFor = async (token: string, extra: Record<string, unknown> = {}) => {
    const { createCustomerFormContext } = await import('~~/server/utils/pageStudio/customerForms')
    return createCustomerFormContext({ sessionToken: token, siteId: fixture.site.id, environment: 'staging' }, {}, { runTransaction, ...extra })
  }
  const completed = () => db.query(`INSERT INTO page_studio_customer_setup_drafts (identity_id, draft, workspace_id) VALUES ($1, '{}'::jsonb, $2)`, [owner.identityId, fixture.workspaceId])
  it('discovers only the current owner completed retained site', async () => {
    await completed()
    const { discoverCustomerDefaultSite } = await import('~~/server/utils/pageStudio/customerForms')
    expect(await discoverCustomerDefaultSite(owner.sessionToken, { runTransaction })).toMatchObject({ workspaceId: fixture.workspaceId, scope: { siteId: fixture.site.id }, actor: { userId: owner.identityId } })
  })
  it('does not select another membership or allocate a default when setup is incomplete', async () => {
    const { discoverCustomerDefaultSite } = await import('~~/server/utils/pageStudio/customerForms')
    await expect(discoverCustomerDefaultSite(owner.sessionToken, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    await expect(discoverCustomerDefaultSite(member.sessionToken, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT count(*) FROM page_studio_customer_site_requests')).rows[0].count).toBe('1')
  })
  it('rejects current non-owner default discovery despite a completed setup', async () => {
    await completed()
    await db.query(`UPDATE page_studio_workspace_memberships SET role='editor' WHERE identity_id=$1`, [owner.identityId])
    const { discoverCustomerDefaultSite } = await import('~~/server/utils/pageStudio/customerForms')
    await expect(discoverCustomerDefaultSite(owner.sessionToken, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects an ambiguous discovery query instead of choosing the first receipt', async () => {
    await completed()
    const { discoverCustomerDefaultSite } = await import('~~/server/utils/pageStudio/customerForms')
    const ambiguous: typeof runTransaction = callback => runTransaction(async (client) => {
      const wrapped = { query: async (...args: Parameters<typeof client.query>) => {
        const result = await client.query(...args)
        if (String(args[0]).startsWith('SELECT receipt.workspace_id')) return { ...result, rows: [...result.rows, ...result.rows] }
        return result
      } }
      return callback(wrapped as unknown as pg.Client)
    })
    await expect(discoverCustomerDefaultSite(owner.sessionToken, { runTransaction: ambiguous })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('ordinary editor reads work with no completed setup and no legacy client rows', async () => {
    const { readCustomerFormsWorkspace } = await import('~~/server/utils/pageStudio/customerForms')
    const document = async () => ({ id: fixture.site.id, site: { id: fixture.site.id, clientId: fixture.businessId, name: 'Flowers', route: '/' }, document: null, revision: 0, pageLimit: 5, updatedAt: null })
    expect(await readCustomerFormsWorkspace(await contextFor(member.sessionToken, { document }), { assets: async () => [] })).toMatchObject({ canEdit: true })
    expect((await db.query('SELECT count(*) FROM page_studio_customer_setup_drafts')).rows[0].count).toBe('0')
    expect((await db.query('SELECT count(*) FROM agency_clients')).rows[0].count).toBe('0')
  })
  it('blocks a Worker write after real membership revocation during document read', async () => {
    const { operateTrustedFormRecipients } = await import('~~/server/utils/pageStudio/formRecipients')
    const document = async () => {
      await db.query('UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp() WHERE identity_id=$1', [member.identityId])
      return { id: fixture.site.id, site: { id: fixture.site.id, clientId: fixture.businessId }, studio: { checkpointId: 'saved', formLibrary: { definitions: [] } } }
    }
    const context = await contextFor(member.sessionToken, { document })
    const write = vi.fn()
    context.service = { writeFormRecipientsDraft: write }
    await expect(operateTrustedFormRecipients(context, { checkpointId: 'saved', expectedRevision: 0, settings: { recipients: [], overrides: [] } })).rejects.toMatchObject({ statusCode: 403 })
    expect(write).not.toHaveBeenCalled()
  })
})
