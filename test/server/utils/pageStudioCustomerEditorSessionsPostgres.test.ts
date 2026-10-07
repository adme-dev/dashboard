import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: native.transaction }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const ownershipMigration = '444_page_studio_customer_site_ownership.sql'
const ids = { owner: randomUUID(), other: randomUUID(), client: randomUUID(), staff: randomUUID() }

describe.runIf(Boolean(databaseUrl))('native customer editor sessions on PostgreSQL', () => {
  const schema = `customer_editor_${randomUUID().replaceAll('-', '')}`
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

  let privatePem: string, publicPem: string
  beforeAll(async () => {
    const keys = await generateKeyPair('ES256', { extractable: true })
    privatePem = await exportPKCS8(keys.privateKey)
    publicPem = await exportSPKI(keys.publicKey)
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
    await db.query(migration('447_page_studio_customer_editor_sessions.sql'))
    await db.query(migration('447_page_studio_customer_editor_sessions.sql'))
    await db.query('CREATE TABLE page_studio_cms_scopes (scope_key TEXT, tenant_id TEXT, client_id UUID, site_id UUID, state TEXT)')
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
  const issuer = config.dashboardOrigin
  const ticket = async () => {
    const api = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    return api.issueCustomerEditorHandoff(token, config, { runTransaction })
  }
  const exchange = async (value: string, signOverride?: (claims: unknown) => Promise<string>) => {
    const api = await import('~~/server/utils/pageStudio/customerEditorSessions')
    const jwt = await import('~~/server/utils/pageStudio/customerEditorToken')
    return api.exchangeCustomerEditorSession(value, config, { runTransaction,
      signToken: signOverride ?? (claims => jwt.signCustomerEditorToken(claims, privatePem, issuer)) })
  }
  const session = async () => {
    const result = await exchange((await ticket()).token)
    const { verifyCustomerEditorToken } = await import('~~/server/utils/pageStudio/customerEditorToken')
    return { ...result, claims: await verifyCustomerEditorToken(result.token, publicPem, issuer) }
  }
  const authorize = async (claims: unknown, capability = 'workspace:checkpoint') => {
    const { assertCustomerEditorSessionAuthority } = await import('~~/server/utils/pageStudio/customerEditorSessions')
    return runTransaction(db => assertCustomerEditorSessionAuthority(claims, capability, db))
  }
  const checkpoint = (claims: { siteId: string, clientId: string, tenantId: string, userId: string }, id = `draft_${randomUUID()}`) => ({
    checkpointId: id, createdAt: new Date().toISOString(), digest: 'a'.repeat(64), etag: 'saved-etag', userId: claims.userId,
    objectKey: `tenants/${claims.tenantId}/clients/${claims.clientId}/sites/${claims.siteId}/checkpoints/${id}.json`,
    scope: { siteId: claims.siteId, clientId: claims.clientId, tenantId: claims.tenantId }
  })
  const commit = async (claims: unknown, input: unknown) => {
    const { commitCustomerEditorCheckpoint } = await import('~~/server/utils/pageStudio/customerEditorSessions')
    return commitCustomerEditorCheckpoint(input, claims, { runTransaction })
  }
  it('exchanges once for a distinct signed native child session without leaking parent credentials', async () => {
    const handoff = await ticket()
    const result = await exchange(handoff.token)
    const { verifyCustomerEditorToken } = await import('~~/server/utils/pageStudio/customerEditorToken')
    const claims = await verifyCustomerEditorToken(result.token, publicPem, issuer)
    expect(claims).toMatchObject({ role: 'customer', environment: 'staging', workspaceId: fixture.workspaceId, siteId: fixture.siteId, userId: ids.owner,
      returnUrl: `${issuer}/studio/dashboard` })
    expect(claims.capabilities).not.toContain('source:edit')
    expect(claims.capabilities).not.toContain('model:invoke')
    await expect(authorize(claims)).resolves.toBeDefined()
    await expect(exchange(handoff.token)).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_editor_sessions')).rows[0].count).toBe('1')
    const stored = JSON.stringify((await db.query('SELECT * FROM page_studio_customer_editor_sessions')).rows)
    expect(stored).not.toContain(result.token)
    expect(JSON.stringify(claims)).not.toContain(hash(token))
  })
  it('rolls back consumption and the child when signing fails', async () => {
    const handoff = await ticket()
    await expect(exchange(handoff.token, async () => {
      throw new Error('signer unavailable')
    })).rejects.toThrow()
    expect((await db.query('SELECT consumed_at FROM page_studio_customer_editor_handoffs')).rows[0].consumed_at).toBeNull()
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_editor_sessions')).rows[0].count).toBe('0')
    await expect(exchange(handoff.token)).resolves.toHaveProperty('token')
  })
  it('admits only exact stored claims and permitted capabilities', async () => {
    const { claims } = await session()
    for (const replacement of [{ userId: ids.other }, { siteId: randomUUID() }, { workspaceId: randomUUID() }, { clientId: randomUUID() },
      { tenantId: 'foreign' }, { nonce: randomUUID() }, { capabilities: ['workspace:status'] }, { expiresAt: claims.expiresAt + 1 },
      { editorOrigin: 'https://foreign.example.test' }, { returnUrl: 'https://foreign.example.test/studio/dashboard' }]) {
      await expect(authorize({ ...claims, ...replacement })).rejects.toMatchObject({ statusCode: 403 })
    }
    for (const capability of ['source:edit', 'model:invoke', 'publish']) await expect(authorize(claims, capability)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['login', 'child', 'account', 'identity', 'membership', 'workspace', 'approver', 'entitlement', 'site'])('rejects %s revocation even with an unexpired JWT', async (reason) => {
    const { claims } = await session()
    const mutations: Record<string, string> = {
      login: 'UPDATE page_studio_customer_sessions SET revoked_at = clock_timestamp()',
      child: 'UPDATE page_studio_customer_editor_sessions SET revoked_at = clock_timestamp()',
      account: 'UPDATE page_studio_customer_accounts SET status = \'suspended\'',
      identity: 'UPDATE page_studio_customer_identities SET status = \'suspended\'',
      membership: 'UPDATE page_studio_workspace_memberships SET role = \'viewer\'',
      workspace: 'UPDATE page_studio_customer_workspaces SET status = \'suspended\'',
      approver: 'UPDATE team_members SET is_active = FALSE',
      entitlement: 'UPDATE page_studio_entitlements SET status = \'cancelled\'',
      site: 'UPDATE page_studio_sites SET status = \'archived\''
    }
    await db.query(mutations[reason]!)
    await expect(authorize(claims)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('saves and reloads an owned draft, rejects stale bases and preserves replay receipts', async () => {
    const { claims } = await session()
    const first = { checkpoint: checkpoint(claims), expectedCheckpointId: null }
    expect(await commit(claims, first)).toMatchObject({ isCurrent: true, checkpointId: first.checkpoint.checkpointId })
    expect(await commit(claims, first)).toMatchObject({ isCurrent: true })
    const second = { checkpoint: checkpoint(claims), expectedCheckpointId: first.checkpoint.checkpointId }
    await commit(claims, second)
    expect(await commit(claims, first)).toMatchObject({ isCurrent: false, currentCheckpointId: second.checkpoint.checkpointId })
    await expect(commit(claims, { checkpoint: checkpoint(claims), expectedCheckpointId: first.checkpoint.checkpointId })).rejects.toMatchObject({ statusCode: 409 })
    const { readCustomerEditorCheckpoint } = await import('~~/server/utils/pageStudio/customerEditorSessions')
    expect(await readCustomerEditorCheckpoint(claims, { runTransaction })).toMatchObject({ checkpointId: second.checkpoint.checkpointId })
    const audit = (await db.query('SELECT metadata FROM page_studio_audit_events WHERE action = \'workspace.checkpointed\' ORDER BY occurred_at LIMIT 1')).rows[0].metadata
    expect(audit.customerEditor).toMatchObject({ sessionId: claims.nonce, workspaceId: fixture.workspaceId, userId: ids.owner })
  })
  it('rejects foreign checkpoint scope/author/object key and managed CMS bypass', async () => {
    const { claims } = await session()
    const draft = checkpoint(claims)
    for (const changed of [{ userId: ids.other }, { scope: { ...draft.scope, siteId: randomUUID() } }, { objectKey: 'foreign/checkpoint.json' }]) {
      await expect(commit(claims, { checkpoint: { ...draft, ...changed }, expectedCheckpointId: null })).rejects.toBeDefined()
    }
    await db.query('INSERT INTO page_studio_cms_scopes VALUES (\'owned\', $1, $2, $3, \'managed\')', [claims.tenantId, claims.clientId, claims.siteId])
    await expect(commit(claims, { checkpoint: draft, expectedCheckpointId: null })).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_checkpoints')).rows[0].count).toBe('0')
  })
  it('rejects a replay and read after logout without changing the saved head', async () => {
    const { claims } = await session()
    const input = { checkpoint: checkpoint(claims), expectedCheckpointId: null }
    await commit(claims, input)
    const { revokeCustomerSession } = await import('~~/server/utils/pageStudio/customerSignup')
    await revokeCustomerSession(token, runTransaction)
    await expect(commit(claims, input)).rejects.toMatchObject({ statusCode: 403 })
    const { readCustomerEditorCheckpoint } = await import('~~/server/utils/pageStudio/customerEditorSessions')
    await expect(readCustomerEditorCheckpoint(claims, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows[0].current_checkpoint_id).toBe(input.checkpoint.checkpointId)
  })
  it('prevents extending or replacing an immutable session and clearing revocation', async () => {
    await session()
    await expect(db.query('UPDATE page_studio_customer_editor_sessions SET expires_at = expires_at + INTERVAL \'1 minute\'')).rejects.toThrow()
    await expect(db.query('UPDATE page_studio_customer_editor_sessions SET claims = \'{}\'::jsonb')).rejects.toThrow()
    await db.query('UPDATE page_studio_customer_editor_sessions SET revoked_at = clock_timestamp()')
    await expect(db.query('UPDATE page_studio_customer_editor_sessions SET revoked_at = NULL')).rejects.toThrow()
  })
  it('serializes simultaneous saves against the same head', async () => {
    const { claims } = await session()
    const inputs = [checkpoint(claims), checkpoint(claims)]
    const results = await Promise.allSettled(inputs.map(draft => commit(claims, { checkpoint: draft, expectedCheckpointId: null })))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_checkpoints')).rows[0].count).toBe('1')
  })
  it('rolls back an exchange if native authority expires during signing', async () => {
    const handoff = await ticket()
    await db.query('UPDATE page_studio_customer_sessions SET expires_at = clock_timestamp() + INTERVAL \'2 seconds\'')
    await expect(exchange(handoff.token, async () => {
      await vi.waitFor(async () => {
        expect((await db.query('SELECT expires_at < clock_timestamp() AS expired FROM page_studio_customer_sessions')).rows[0].expired).toBe(true)
      }, { timeout: 4000, interval: 20 })
      return 'signed-but-no-longer-authorized'
    })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT consumed_at FROM page_studio_customer_editor_handoffs')).rows[0].consumed_at).toBeNull()
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_editor_sessions')).rows[0].count).toBe('0')
  })
  it.each(['expiry', 'logout'])('rejects %s while a save waits for authority locks', async (reason) => {
    const { claims } = await session()
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
      if (reason === 'expiry') {
        await db.query('UPDATE page_studio_customer_sessions SET expires_at = clock_timestamp() + INTERVAL \'700 milliseconds\'')
        await holder.query('SELECT id FROM page_studio_sites FOR UPDATE')
      } else await holder.query('SELECT token_hash FROM page_studio_customer_sessions FOR UPDATE')
      const { commitCustomerEditorCheckpoint } = await import('~~/server/utils/pageStudio/customerEditorSessions')
      outcome = Promise.allSettled([commitCustomerEditorCheckpoint({ checkpoint: checkpoint(claims), expectedCheckpointId: null }, claims, { runTransaction: callback => callback(reader) })])
      await vi.waitFor(async () => {
        expect((await db.query('SELECT $2::int = ANY(pg_blocking_pids($1)) AS blocked', [readerPid, holderPid])).rows[0].blocked).toBe(true)
      }, { timeout: 3000, interval: 10 })
      if (reason === 'expiry') await vi.waitFor(async () => {
        expect((await db.query('SELECT expires_at < clock_timestamp() AS expired FROM page_studio_customer_sessions')).rows[0].expired).toBe(true)
      }, { timeout: 3000, interval: 10 })
      else await holder.query('UPDATE page_studio_customer_sessions SET revoked_at = clock_timestamp()')
      await holder.query('COMMIT')
      expect((await outcome)[0]).toMatchObject({ status: 'rejected', reason: { statusCode: 403 } })
      expect((await reader.query('SELECT COUNT(*) FROM page_studio_checkpoints')).rows[0].count).toBe('0')
    } finally {
      await holder.query('ROLLBACK')
      await outcome
      await reader.query('ROLLBACK')
      await Promise.all([holder.end(), reader.end()])
    }
  })
})
