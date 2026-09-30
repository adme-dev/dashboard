import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const ids = { a: randomUUID(), b: randomUUID(), portal: randomUUID(), client: randomUUID(), otherClient: randomUUID(), user: randomUUID(), staff: randomUUID() }

describe.runIf(Boolean(databaseUrl))('customer workspace authority on disposable PostgreSQL', () => {
  const schema = `workspace_${randomUUID().replaceAll('-', '')}`
  let db: pg.Client
  let api: typeof import('~~/server/utils/pageStudio/customerWorkspaces')
  const runTransaction = async <T>(callback: (client: pg.Client) => Promise<T>) => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { await client.end() }
  }
  const create = (identityId = ids.a, requestId = randomUUID(), name = 'Acme Website') => api.createCustomerWorkspace({ identityId, requestId, name }, runTransaction)
  const access = (workspaceId: string, identityId = ids.a) => api.resolveCustomerWorkspaceAccess({ workspaceId, identityId }, runTransaction)
  const bind = (workspaceId: string, clientId = ids.client, tenantId = 'agency-a') => api.bindLegacyCustomerWorkspace({ workspaceId, identityId: ids.portal, clientId, tenantId }, runTransaction)

  beforeAll(async () => {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(databaseUrl!).hostname)
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL);
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID REFERENCES agency_clients(id), status TEXT, role TEXT);
      CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL);
      CREATE TABLE page_studio_entitlements (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID REFERENCES agency_clients(id), status TEXT);
    `)
    const migration = readFileSync(new URL('../../../server/database/migrations/442_page_studio_customer_workspaces.sql', import.meta.url), 'utf8')
    await db.query(migration)
    await db.query(migration)
    api = await import('~~/server/utils/pageStudio/customerWorkspaces')
  })
  beforeEach(async () => {
    await db.query(`TRUNCATE page_studio_workspace_events, page_studio_workspace_agency_grants,
      page_studio_workspace_client_bindings, page_studio_workspace_memberships,
      page_studio_customer_workspaces, page_studio_customer_identities,
      page_studio_entitlements, client_users, agency_clients, team_members CASCADE`)
    await db.query('INSERT INTO agency_clients VALUES ($1, TRUE), ($2, TRUE)', [ids.client, ids.otherClient])
    await db.query('INSERT INTO client_users VALUES ($1, $2, \'active\', \'admin\')', [ids.user, ids.client])
    await db.query('INSERT INTO team_members VALUES ($1, TRUE)', [ids.staff])
    await db.query('INSERT INTO page_studio_entitlements VALUES ($1, \'agency-a\', $2, \'active\')', [randomUUID(), ids.client])
    await db.query(`INSERT INTO page_studio_customer_identities (id, issuer, subject, verified_at)
      VALUES ($1::uuid, 'studio', $1::uuid::text, NOW()), ($2::uuid, 'studio', $2::uuid::text, NOW())`, [ids.a, ids.b])
    await db.query(`INSERT INTO page_studio_customer_identities (id, issuer, subject, portal_user_id, verified_at)
      VALUES ($1, 'portal', $2::uuid::text, $2::uuid, NOW())`, [ids.portal, ids.user])
  })
  afterAll(async () => {
    if (!db) return
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  it('creates independent customer workspaces with atomic owner membership and no agency account', async () => {
    const a = await create()
    const b = await create(ids.b)
    expect(a.workspace.id).not.toBe(b.workspace.id)
    expect(await access(a.workspace.id)).toMatchObject({ role: 'owner', workspaceId: a.workspace.id, legacyBinding: null })
    await expect(access(a.workspace.id, ids.b)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    expect((await db.query('SELECT COUNT(*) FROM agency_clients')).rows[0].count).toBe('2')
    expect((await db.query('SELECT COUNT(*) FROM page_studio_workspace_events')).rows[0].count).toBe('2')
  })

  it('reconciles concurrent duplicate requests and rejects changed terms', async () => {
    const requestId = randomUUID()
    const results = await Promise.all([create(ids.a, requestId), create(ids.a, requestId), create(ids.a, requestId)])
    expect(new Set(results.map(r => r.workspace.id)).size).toBe(1)
    expect(results.filter(r => !r.replayed)).toHaveLength(1)
    await expect(create(ids.a, requestId, 'Changed name')).rejects.toMatchObject({ code: 'WORKSPACE_REQUEST_CONFLICT' })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_workspace_events')).rows[0].count).toBe('1')
  })

  it('does not leave an orphan workspace if membership insertion fails', async () => {
    await db.query(`ALTER TABLE page_studio_workspace_memberships ADD CONSTRAINT fixture_failure CHECK (role <> 'owner')`)
    await expect(create()).rejects.toThrow()
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_workspaces')).rows[0].count).toBe('0')
    await db.query('ALTER TABLE page_studio_workspace_memberships DROP CONSTRAINT fixture_failure')
  })

  it('rejects unverified/suspended identities before creation or access', async () => {
    await db.query('UPDATE page_studio_customer_identities SET verified_at = NULL WHERE id = $1', [ids.a])
    await expect(create()).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    await db.query('UPDATE page_studio_customer_identities SET verified_at = NOW() WHERE id = $1', [ids.a])
    const { workspace } = await create()
    await db.query('UPDATE page_studio_customer_identities SET status = \'suspended\' WHERE id = $1', [ids.a])
    await expect(access(workspace.id)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
  })

  it.each(['revoked', 'expired', 'workspace-suspended'])('rejects %s access and cannot restore it by replaying creation', async (reason) => {
    const requestId = randomUUID()
    const { workspace } = await create(ids.a, requestId)
    if (reason === 'revoked') await db.query('UPDATE page_studio_workspace_memberships SET revoked_at = NOW()')
    if (reason === 'expired') await db.query('UPDATE page_studio_workspace_memberships SET expires_at = NOW() - INTERVAL \'1 minute\'')
    if (reason === 'workspace-suspended') await db.query('UPDATE page_studio_customer_workspaces SET status = \'suspended\'')
    await expect(access(workspace.id)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    await expect(create(ids.a, requestId)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
  })

  it('maps an existing client explicitly and preserves the mapping on replay', async () => {
    const { workspace } = await create(ids.portal)
    await bind(workspace.id)
    await bind(workspace.id)
    expect(await access(workspace.id, ids.portal)).toMatchObject({ legacyBinding: { tenantId: 'agency-a', clientId: ids.client } })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_workspace_events WHERE action = \'legacy_client_bound\'')).rows[0].count).toBe('1')
  })

  it('refuses foreign clients, inferred tenants and duplicate legacy ownership', async () => {
    const { workspace } = await create(ids.portal)
    await expect(bind(workspace.id, ids.otherClient)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    await expect(bind(workspace.id, ids.client, 'agency-b')).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    await bind(workspace.id)
    const second = await create(ids.portal)
    await expect(bind(second.workspace.id)).rejects.toMatchObject({ code: 'WORKSPACE_BINDING_CONFLICT' })
  })

  it.each(['user', 'client'])('rechecks legacy %s activation for mapped access', async (target) => {
    const { workspace } = await create(ids.portal)
    await bind(workspace.id)
    if (target === 'user') await db.query('UPDATE client_users SET status = \'suspended\'')
    else await db.query('UPDATE agency_clients SET is_active = FALSE')
    await expect(access(workspace.id, ids.portal)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
  })

  it('rejects replay after a portal user moves to a different client', async () => {
    const requestId = randomUUID()
    const { workspace } = await create(ids.portal, requestId)
    await bind(workspace.id)
    await db.query('UPDATE client_users SET client_id = $1 WHERE id = $2', [ids.otherClient, ids.user])
    await expect(access(workspace.id, ids.portal)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    await expect(create(ids.portal, requestId)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
  })

  it.each(['studio', 'portal-viewer', 'workspace-manager'])('refuses legacy binding by %s', async (actor) => {
    const identityId = actor === 'studio' ? ids.a : ids.portal
    const { workspace } = await create(identityId)
    if (actor === 'portal-viewer') await db.query(`UPDATE client_users SET role = 'viewer'`)
    if (actor === 'workspace-manager') await db.query(`UPDATE page_studio_workspace_memberships SET role = 'manager'`)
    await expect(api.bindLegacyCustomerWorkspace({ workspaceId: workspace.id, identityId, clientId: ids.client, tenantId: 'agency-a' }, runTransaction)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_workspace_client_bindings')).rows[0].count).toBe('0')
  })

  it('allows an active portal manager to bind only their own client', async () => {
    await db.query(`UPDATE client_users SET role = 'manager'`)
    const { workspace } = await create(ids.portal)
    await expect(bind(workspace.id)).resolves.toMatchObject({ clientId: ids.client })
  })

  it('retains one binding under concurrent competing workspaces', async () => {
    const otherUser = randomUUID()
    const otherIdentity = randomUUID()
    await db.query(`INSERT INTO client_users VALUES ($1, $2, 'active', 'admin')`, [otherUser, ids.client])
    await db.query(`INSERT INTO page_studio_customer_identities (id, issuer, subject, portal_user_id, verified_at)
      VALUES ($1, 'portal', $2::uuid::text, $2::uuid, NOW())`, [otherIdentity, otherUser])
    const first = await create(ids.portal)
    const second = await create(otherIdentity)
    const results = await Promise.allSettled([
      bind(first.workspace.id),
      api.bindLegacyCustomerWorkspace({ workspaceId: second.workspace.id, identityId: otherIdentity, clientId: ids.client, tenantId: 'agency-a' }, runTransaction)
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'WORKSPACE_BINDING_CONFLICT' } })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_workspace_client_bindings')).rows[0].count).toBe('1')
    expect((await db.query(`SELECT COUNT(*) FROM page_studio_workspace_events WHERE action = 'legacy_client_bound'`)).rows[0].count).toBe('1')
  })

  it('does not let a foreign portal membership override a client binding', async () => {
    const { workspace } = await create(ids.portal)
    await bind(workspace.id)
    const foreignUser = randomUUID()
    const foreignIdentity = randomUUID()
    await db.query(`INSERT INTO client_users VALUES ($1, $2, 'active', 'admin')`, [foreignUser, ids.otherClient])
    await db.query(`INSERT INTO page_studio_customer_identities (id, issuer, subject, portal_user_id, verified_at)
      VALUES ($1, 'portal', $2::uuid::text, $2::uuid, NOW())`, [foreignIdentity, foreignUser])
    await db.query(`INSERT INTO page_studio_workspace_memberships (workspace_id, identity_id, role)
      VALUES ($1, $2, 'owner')`, [workspace.id, foreignIdentity])
    await expect(access(workspace.id, foreignIdentity)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
  })

  it('rejects unrecognized fields and malformed workspace names', async () => {
    await expect(create(ids.a, randomUUID(), '   ')).rejects.toMatchObject({ code: 'WORKSPACE_INVALID_INPUT' })
    await expect(api.createCustomerWorkspace({ identityId: ids.a, requestId: randomUUID(), name: 'Acme', role: 'owner' } as never, runTransaction)).rejects.toMatchObject({ code: 'WORKSPACE_INVALID_INPUT' })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_workspaces')).rows[0].count).toBe('0')
  })

  it('requires an explicit grant for the exact agency actor, tenant and workspace', async () => {
    const { workspace } = await create()
    const request = { workspaceId: workspace.id, agencyUserId: ids.staff, tenantId: 'agency-a' }
    await expect(api.resolveAgencyWorkspaceAccess(request, runTransaction)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    await db.query(`INSERT INTO page_studio_workspace_agency_grants (workspace_id, agency_user_id, tenant_id, capabilities)
      VALUES ($1, $2, 'agency-a', ARRAY['workspace.read', 'site.design'])`, [workspace.id, ids.staff])
    expect(await api.resolveAgencyWorkspaceAccess(request, runTransaction)).toEqual({ workspaceId: workspace.id, capabilities: ['workspace.read', 'site.design'] })
    await expect(api.resolveAgencyWorkspaceAccess({ ...request, tenantId: 'agency-b' }, runTransaction)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    await expect(api.resolveAgencyWorkspaceAccess({ ...request, agencyUserId: randomUUID() }, runTransaction)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
    await expect(db.query('UPDATE page_studio_workspace_agency_grants SET capabilities = ARRAY[\'billing.manage\']')).rejects.toMatchObject({ code: '23514' })
    await db.query('UPDATE page_studio_workspace_agency_grants SET revoked_at = NOW()')
    await expect(api.resolveAgencyWorkspaceAccess(request, runTransaction)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
  })

  it.each(['expired', 'staff-inactive', 'workspace-suspended'])('rejects %s agency grants', async (reason) => {
    const { workspace } = await create()
    await db.query(`INSERT INTO page_studio_workspace_agency_grants (workspace_id, agency_user_id, tenant_id, capabilities)
      VALUES ($1, $2, 'agency-a', ARRAY['workspace.read'])`, [workspace.id, ids.staff])
    if (reason === 'expired') await db.query('UPDATE page_studio_workspace_agency_grants SET expires_at = NOW() - INTERVAL \'1 minute\'')
    if (reason === 'staff-inactive') await db.query('UPDATE team_members SET is_active = FALSE')
    if (reason === 'workspace-suspended') await db.query('UPDATE page_studio_customer_workspaces SET status = \'suspended\'')
    await expect(api.resolveAgencyWorkspaceAccess({ workspaceId: workspace.id, agencyUserId: ids.staff, tenantId: 'agency-a' }, runTransaction)).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' })
  })
})
