import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: native.transaction }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const ownershipMigration = '444_page_studio_customer_site_ownership.sql'
const ids = { owner: randomUUID(), other: randomUUID(), client: randomUUID(), staff: randomUUID() }

describe.runIf(Boolean(databaseUrl))('native customer editor handoff on PostgreSQL', () => {
  const schema = `customer_handoff_${randomUUID().replaceAll('-', '')}`
  let db: pg.Client
  let workspaces: typeof import('~~/server/utils/pageStudio/customerWorkspaces')
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
  const workspace = async (identityId = ids.owner) => (await workspaces.createCustomerWorkspace({ identityId, requestId: randomUUID(), name: 'Customer business' }, runTransaction)).workspace.id

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
      CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT);
      CREATE TABLE role_permission_groups (role_id UUID, permission_group TEXT, UNIQUE (role_id, permission_group));
    `)
    await db.query(migration('402_page_studio_control_plane.sql'))
    await db.query(migration('442_page_studio_customer_workspaces.sql'))
    await db.query(migration('443_page_studio_customer_signup.sql'))
    await db.query(migration(ownershipMigration))
    await db.query(migration('445_page_studio_customer_provisioning.sql'))
    await db.query(migration('445_page_studio_customer_provisioning.sql'))
    await db.query(migration('446_page_studio_customer_editor_handoffs.sql'))
    await db.query(migration('446_page_studio_customer_editor_handoffs.sql'))
    workspaces = await import('~~/server/utils/pageStudio/customerWorkspaces')
  })
  beforeEach(async () => {
    await db.query(`TRUNCATE agency_clients, team_members, page_studio_customer_identities CASCADE`)
    await db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [ids.client])
    await db.query('INSERT INTO team_members VALUES ($1, TRUE)', [ids.staff])
    await db.query(`INSERT INTO page_studio_customer_identities (id, issuer, subject, verified_at)
      VALUES ($1::uuid, 'studio', $1::uuid::text, NOW()), ($2::uuid, 'studio', $2::uuid::text, NOW())`, [ids.owner, ids.other])
    native.transaction.mockImplementation(runTransaction)
  })
  afterAll(async () => {
    if (!db) return
    await db.query('ROLLBACK')
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  const token = 'a'.repeat(64)
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  let fixture: { siteId: string, workspaceId: string }
  beforeEach(async () => {
    const wid = await workspace()
    const accountId = randomUUID()
    await db.query(`UPDATE page_studio_customer_identities SET subject = $1 WHERE id = $2`, [accountId, ids.owner])
    await db.query(`INSERT INTO page_studio_customer_accounts (id, email, name, identity_id, status, terms_version)
      VALUES ($1, 'owner@example.test', 'Owner', $2, 'active', 'v1')`, [accountId, ids.owner])
    await db.query(`INSERT INTO page_studio_customer_sessions (token_hash, account_id, expires_at)
      VALUES ($1, $2, clock_timestamp() + INTERVAL '1 day')`, [hash(token), accountId])
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    const result = await createCustomerPreviewSite({ workspaceId: wid, identityId: ids.owner, requestId: randomUUID(),
      name: 'Customer Flowers', route: 'flowers', starterVersion: 'floristry-v1' }, { runTransaction,
      previewPolicy: { approvalId: randomUUID(), approvedBy: ids.staff, expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        pagesPerSiteLimit: 5, storageBytesLimit: 104857600, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 1073741824 } })
    fixture = { workspaceId: wid, siteId: result.site.id }
    await db.query('INSERT INTO page_studio_customer_setup_drafts (identity_id, workspace_id, draft) VALUES ($1, $2, $3::jsonb)', [ids.owner, wid, JSON.stringify({ businessName: 'Customer Flowers', businessType: 'Florist', timezone: 'UTC', goals: ['enquiries'] })])
  })
  const config = { enabled: true, dashboardOrigin: 'https://customers.example.test', editorOrigin: 'https://studio.example.test' }
  const issue = async (overrides: Record<string, unknown> = {}) => {
    const api = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    return api.issueCustomerEditorHandoff(token, { ...config, ...overrides }, { runTransaction })
  }
  const redeem = async (handoffToken: string, overrides: Record<string, unknown> = {}) => {
    const api = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    return api.redeemCustomerEditorHandoff(handoffToken, { ...config, ...overrides }, { runTransaction })
  }

  it('derives native scope, keeps secrets hashed and returns the fixed dashboard destination', async () => {
    const ticket = await issue()
    expect(ticket.token).toMatch(/^[A-Za-z0-9_-]{64}$/)
    const row = (await db.query('SELECT * FROM page_studio_customer_editor_handoffs')).rows[0]
    expect(row.token_hash).toBe(hash(ticket.token))
    expect(row.login_session_hash).toBe(hash(token))
    expect(JSON.stringify(row)).not.toContain(ticket.token)
    expect(new Date(ticket.expiresAt).getTime() - Date.now()).toBeGreaterThan(0)
    expect(new Date(ticket.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(120000)
    const context = await redeem(ticket.token)
    expect(context).toMatchObject({ kind: 'customer-editor-handoff', identityId: ids.owner, workspaceId: fixture.workspaceId,
      scope: { siteId: fixture.siteId, environment: 'staging' }, returnUrl: 'https://customers.example.test/studio/dashboard' })
    for (const key of ['session', 'capabilities', 'ready', 'token', 'loginSessionHash']) expect(context).not.toHaveProperty(key)
    expect((await db.query('SELECT consumed_at FROM page_studio_customer_editor_handoffs')).rows[0].consumed_at).toBeTruthy()
    const audit = (await db.query('SELECT action, metadata FROM page_studio_audit_events WHERE resource_type = \'customer_editor_handoff\' ORDER BY occurred_at')).rows
    expect(audit.map(row => row.action)).toEqual(['customer.handoff_issued', 'customer.handoff_consumed'])
    expect(JSON.stringify(audit)).not.toContain(ticket.token)
    expect(JSON.stringify(audit)).not.toContain(hash(token))
  })

  it('rejects setup belonging to a different customer', async () => {
    const foreignWorkspace = await workspace(ids.other)
    await db.query('UPDATE page_studio_customer_setup_drafts SET workspace_id = $1', [foreignWorkspace])
    await expect(issue()).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_editor_handoffs')).rows[0].count).toBe('0')
  })

  it('clamps expiry to the native login and cannot enter the legacy editor claims path', async () => {
    await db.query('UPDATE page_studio_customer_sessions SET expires_at = clock_timestamp() + INTERVAL \'20 seconds\'')
    const ticket = await issue()
    const parent = (await db.query('SELECT expires_at FROM page_studio_customer_sessions')).rows[0].expires_at
    expect(new Date(ticket.expiresAt).getTime()).toBe(new Date(parent).getTime())
    const context = await redeem(ticket.token)
    const { PageStudioSessionClaimsSchema } = await import('~~/server/utils/pageStudio/sessions')
    expect(PageStudioSessionClaimsSchema.safeParse(context).success).toBe(false)
    expect(PageStudioSessionClaimsSchema.safeParse(ticket.token).success).toBe(false)
  })

  it('allows exactly one of concurrent redemptions and rejects replay', async () => {
    const ticket = await issue()
    const outcomes = await Promise.allSettled([redeem(ticket.token), redeem(ticket.token), redeem(ticket.token)])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    await expect(redeem(ticket.token)).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each([
    { enabled: false }, { editorOrigin: 'https://foreign.example.test' }, { dashboardOrigin: 'https://foreign.example.test' },
    { editorOrigin: 'http://studio.example.test' }, { editorOrigin: 'https://studio.example.test/path' },
    { editorOrigin: 'https://user@studio.example.test' }, { editorOrigin: 'https://studio.example.test?return=foreign' },
    { editorOrigin: 'https://customers.example.test' }
  ])('rejects disabled, changed or invalid configuration without consuming: %j', async (overrides) => {
    const ticket = await issue()
    await expect(redeem(ticket.token, overrides)).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT consumed_at FROM page_studio_customer_editor_handoffs')).rows[0].consumed_at).toBeNull()
  })

  it.each(['login', 'account', 'identity', 'workspace', 'membership', 'approver', 'entitlement', 'site'])('denies %s revocation after issuance', async (reason) => {
    const ticket = await issue()
    const mutations: Record<string, string> = {
      login: 'UPDATE page_studio_customer_sessions SET revoked_at = clock_timestamp()',
      account: 'UPDATE page_studio_customer_accounts SET status = \'suspended\'',
      identity: 'UPDATE page_studio_customer_identities SET status = \'suspended\'',
      workspace: 'UPDATE page_studio_customer_workspaces SET status = \'suspended\'',
      membership: 'UPDATE page_studio_workspace_memberships SET role = \'viewer\'',
      approver: 'UPDATE team_members SET is_active = FALSE',
      entitlement: 'UPDATE page_studio_entitlements SET status = \'cancelled\'',
      site: 'UPDATE page_studio_sites SET status = \'archived\''
    }
    await db.query(mutations[reason]!)
    await expect(redeem(ticket.token)).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT consumed_at FROM page_studio_customer_editor_handoffs')).rows[0].consumed_at).toBeNull()
  })

  it('rejects expired tickets using the database clock', async () => {
    // Insert an expired immutable receipt rather than sleeping or mutating expiry.
    const ticket = await issue()
    const expired = 'z'.repeat(64)
    await db.query(`INSERT INTO page_studio_customer_editor_handoffs
      (token_hash, login_session_hash, identity_id, workspace_id, site_id, tenant_id, business_id, dashboard_origin, editor_origin, issued_at, expires_at)
      SELECT $1, login_session_hash, identity_id, workspace_id, site_id, tenant_id, business_id, dashboard_origin, editor_origin,
        NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '1 minute'
      FROM page_studio_customer_editor_handoffs WHERE token_hash = $2`, [hash(expired), hash(ticket.token)])
    await expect(redeem(expired)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('cannot change retained scope, extend expiry or clear consumption', async () => {
    const ticket = await issue()
    for (const change of ['editor_origin = \'https://foreign.example.test\'', 'identity_id = \'' + ids.other + '\'', 'expires_at = expires_at + INTERVAL \'1 minute\'']) {
      await expect(db.query('UPDATE page_studio_customer_editor_handoffs SET ' + change)).rejects.toThrow()
    }
    await redeem(ticket.token)
    await expect(db.query('UPDATE page_studio_customer_editor_handoffs SET consumed_at = NULL')).rejects.toThrow()
  })

  it('requires completed setup and does not create a site or provisioning intent', async () => {
    const count = (await db.query('SELECT COUNT(*) FROM page_studio_sites')).rows[0].count
    await db.query('DELETE FROM page_studio_customer_setup_drafts')
    await expect(issue()).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_sites')).rows[0].count).toBe(count)
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_provisioning_intents')).rows[0].count).toBe('0')
  })

  it('rejects unknown tokens and caller-selected scope', async () => {
    await expect(redeem('x'.repeat(64))).rejects.toMatchObject({ statusCode: 403 })
    await expect(issue({ siteId: fixture.siteId })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects membership expiry while waiting to consume a ticket', async () => {
    const ticket = await issue()
    const holder = new pg.Client({ connectionString: databaseUrl })
    const reader = new pg.Client({ connectionString: databaseUrl })
    await Promise.all([holder.connect(), reader.connect()])
    let outcome: Promise<PromiseSettledResult<unknown>[]> | undefined
    try {
      for (const client of [holder, reader]) {
        await client.query('BEGIN')
        await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      }
      const holderPid = (await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id
      const readerPid = (await reader.query('SELECT pg_backend_pid() AS id')).rows[0].id
      await db.query('UPDATE page_studio_workspace_memberships SET expires_at = clock_timestamp() + INTERVAL \'700 milliseconds\'')
      await holder.query('SELECT id FROM page_studio_customer_editor_handoffs FOR UPDATE')
      const { redeemCustomerEditorHandoff } = await import('~~/server/utils/pageStudio/customerEditorHandoff')
      outcome = Promise.allSettled([redeemCustomerEditorHandoff(ticket.token, config, { runTransaction: callback => callback(reader) })])
      await vi.waitFor(async () => {
        expect((await db.query('SELECT $2::int = ANY(pg_blocking_pids($1)) AS blocked', [readerPid, holderPid])).rows[0].blocked).toBe(true)
      }, { timeout: 3000, interval: 10 })
      await vi.waitFor(async () => {
        expect((await db.query('SELECT expires_at < clock_timestamp() AS expired FROM page_studio_workspace_memberships WHERE identity_id = $1', [ids.owner])).rows[0].expired).toBe(true)
      }, { timeout: 3000, interval: 10 })
      await holder.query('COMMIT')
      const [result] = await outcome
      expect(result).toMatchObject({ status: 'rejected', reason: { statusCode: 403 } })
    } finally {
      await holder.query('ROLLBACK')
      await outcome
      await reader.query('ROLLBACK')
      await Promise.all([holder.end(), reader.end()])
    }
  })

  it('rejects membership expiry while issuance waits for the site lock', async () => {
    const holder = new pg.Client({ connectionString: databaseUrl })
    const reader = new pg.Client({ connectionString: databaseUrl })
    await Promise.all([holder.connect(), reader.connect()])
    let outcome: Promise<PromiseSettledResult<unknown>[]> | undefined
    try {
      for (const client of [holder, reader]) {
        await client.query('BEGIN')
        await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      }
      const holderPid = (await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id
      const readerPid = (await reader.query('SELECT pg_backend_pid() AS id')).rows[0].id
      await db.query('UPDATE page_studio_workspace_memberships SET expires_at = clock_timestamp() + INTERVAL \'700 milliseconds\'')
      await holder.query('SELECT id FROM page_studio_sites FOR UPDATE')
      const { issueCustomerEditorHandoff } = await import('~~/server/utils/pageStudio/customerEditorHandoff')
      outcome = Promise.allSettled([issueCustomerEditorHandoff(token, config, { runTransaction: callback => callback(reader) })])
      await vi.waitFor(async () => {
        expect((await db.query('SELECT $2::int = ANY(pg_blocking_pids($1)) AS blocked', [readerPid, holderPid])).rows[0].blocked).toBe(true)
      }, { timeout: 3000, interval: 10 })
      await vi.waitFor(async () => {
        expect((await db.query('SELECT expires_at < clock_timestamp() AS expired FROM page_studio_workspace_memberships WHERE identity_id = $1', [ids.owner])).rows[0].expired).toBe(true)
      }, { timeout: 3000, interval: 10 })
      await holder.query('COMMIT')
      const [result] = await outcome
      expect(result).toMatchObject({ status: 'rejected', reason: { statusCode: 403 } })
    } finally {
      await holder.query('ROLLBACK')
      await outcome
      await reader.query('ROLLBACK')
      await Promise.all([holder.end(), reader.end()])
    }
  })

  it('rejects logout that commits while redemption waits for native authority', async () => {
    const ticket = await issue()
    const holder = new pg.Client({ connectionString: databaseUrl })
    const reader = new pg.Client({ connectionString: databaseUrl })
    await Promise.all([holder.connect(), reader.connect()])
    let outcome: Promise<PromiseSettledResult<unknown>[]> | undefined
    try {
      for (const client of [holder, reader]) {
        await client.query('BEGIN')
        await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      }
      const holderPid = (await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id
      const readerPid = (await reader.query('SELECT pg_backend_pid() AS id')).rows[0].id
      await holder.query('SELECT token_hash FROM page_studio_customer_sessions FOR UPDATE')
      const { redeemCustomerEditorHandoff } = await import('~~/server/utils/pageStudio/customerEditorHandoff')
      outcome = Promise.allSettled([redeemCustomerEditorHandoff(ticket.token, config, { runTransaction: callback => callback(reader) })])
      await vi.waitFor(async () => {
        expect((await db.query('SELECT $2::int = ANY(pg_blocking_pids($1)) AS blocked', [readerPid, holderPid])).rows[0].blocked).toBe(true)
      }, { timeout: 3000, interval: 10 })
      await holder.query('UPDATE page_studio_customer_sessions SET revoked_at = clock_timestamp()')
      await holder.query('COMMIT')
      const [result] = await outcome
      expect(result).toMatchObject({ status: 'rejected', reason: { statusCode: 403 } })
    } finally {
      await holder.query('ROLLBACK')
      await outcome
      await reader.query('ROLLBACK')
      await Promise.all([holder.end(), reader.end()])
    }
  })
})
