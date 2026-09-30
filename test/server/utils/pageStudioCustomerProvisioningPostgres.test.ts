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

describe.runIf(Boolean(databaseUrl))('standalone customer provisioning authority on PostgreSQL', () => {
  const schema = `customer_provision_${randomUUID().replaceAll('-', '')}`
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
  })
  const prepare = async (sessionToken = token, siteId = fixture.siteId) => {
    const api = await import('~~/server/utils/pageStudio/customerProvisioning')
    return api.prepareCustomerProvisioning({ sessionToken, siteId }, { runTransaction })
  }
  const verify = async (job: unknown, environment: 'staging' | 'production' = 'staging') => {
    const api = await import('~~/server/utils/pageStudio/provisioningAuthority')
    return runTransaction(db => api.verifyPageStudioProvisioningJobAuthority(job, environment, { transaction: db }))
  }

  it('shares signup lock order while workspace access holds the customer identity', async () => {
    const clients = await Promise.all(Array.from({ length: 3 }, async () => {
      const client = new pg.Client({ connectionString: databaseUrl })
      await client.connect()
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      return { client, pid: (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number }
    }))
    const [holder, reader, provisioner] = clients
    const completed: Promise<PromiseSettledResult<unknown>[]>[] = []
    const commit = <T>(client: pg.Client, operation: Promise<T>) => operation.then(async (result) => {
      await client.query('COMMIT')
      return result
    }, async (error) => {
      await client.query('ROLLBACK')
      throw error
    })
    const waitsFor = (waiting: number, blocker: number) => vi.waitFor(async () => {
      const result = await db.query('SELECT $2::int = ANY(pg_blocking_pids($1)) AS blocked', [waiting, blocker])
      expect(result.rows[0].blocked).toBe(true)
    }, { timeout: 3000, interval: 10 })
    try {
      await holder.client.query('SELECT id FROM page_studio_customer_identities WHERE id = $1 FOR UPDATE', [ids.owner])
      const { readCustomerSession } = await import('~~/server/utils/pageStudio/customerSignup')
      completed.push(Promise.allSettled([commit(reader.client, readCustomerSession(token, callback => callback(reader.client)))]))
      await waitsFor(reader.pid, holder.pid)
      const { prepareCustomerProvisioning } = await import('~~/server/utils/pageStudio/customerProvisioning')
      completed.push(Promise.allSettled([commit(provisioner.client, prepareCustomerProvisioning({ sessionToken: token, siteId: fixture.siteId }, {
        runTransaction: callback => callback(provisioner.client)
      }))]))
      await waitsFor(provisioner.pid, reader.pid)
      await holder.client.query('COMMIT')
      const results = (await Promise.all(completed)).flat()
      expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
      expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_provisioning_intents')).rows[0].count).toBe('1')
    } finally {
      await holder.client.query('ROLLBACK')
      await Promise.all(completed)
      await Promise.all(clients.map(async ({ client }) => {
        await client.query('ROLLBACK')
        await client.end()
      }))
    }
  })

  it.each([1, 121, 160])('preserves an accepted %i-character business name through provisioning', async (length) => {
    const name = 'A'.repeat(length)
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    const policy = (await db.query('SELECT preview_policy FROM page_studio_customer_site_requests WHERE site_id = $1', [fixture.siteId])).rows[0].preview_policy
    const result = await createCustomerPreviewSite({ workspaceId: await workspace(), identityId: ids.owner,
      requestId: randomUUID(), name, route: `name-${length}`, starterVersion: 'floristry-v1' }, { runTransaction, previewPolicy: policy })
    const job = await prepare(token, result.site.id)
    expect(job.setup?.businessName).toBe(name)
    await expect(verify(job)).resolves.toMatchObject({ userId: ids.owner })
  })

  const dashboardSetup = async (fresh = false) => {
    if (fresh) fixture.workspaceId = await workspace()
    await db.query(`INSERT INTO page_studio_customer_setup_drafts (identity_id, workspace_id, draft)
      VALUES ($1, $2, $3::jsonb)`, [ids.owner, fixture.workspaceId,
      JSON.stringify({ businessName: 'Customer Flowers', businessType: 'Florist', timezone: 'UTC', goals: ['enquiries'] })])
    const policy = (await db.query('SELECT preview_policy FROM page_studio_customer_site_requests WHERE site_id = $1', [fixture.siteId])).rows[0].preview_policy
    let retained: unknown = null
    const binding = { readProvisioning: vi.fn(async () => retained), createProvisioning: vi.fn(async (job: unknown) => {
      retained = job
      return job
    }) }
    return { runTransaction, enabled: true, binding, approval: { workspaceId: fixture.workspaceId, starterVersion: 'floristry-v1', policy } }
  }

  it.each(['entitlement', 'approver'])('does not offer resume for a pre-intent preview with revoked %s', async (reason) => {
    const options = await dashboardSetup()
    if (reason === 'entitlement') await db.query('UPDATE page_studio_entitlements SET effective_until = NOW() - INTERVAL \'1 second\'')
    else await db.query('UPDATE team_members SET is_active = FALSE')
    const { readCustomerDashboard } = await import('~~/server/utils/pageStudio/customerDashboard')
    expect(await readCustomerDashboard(token, options)).toMatchObject({ state: 'needs-attention', canCreate: false, canRetry: false })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_provisioning_intents')).rows[0].count).toBe('0')
  })

  it.each([1, 2])('never offers a three-page starter against a %i-page approval', async (limit) => {
    const options = await dashboardSetup(true)
    options.approval.policy.pagesPerSiteLimit = limit
    const { readCustomerDashboard } = await import('~~/server/utils/pageStudio/customerDashboard')
    expect(await readCustomerDashboard(token, options)).toMatchObject({ state: 'approval-pending', canCreate: false })
  })

  it('shows an approved preview action without allocating on a dashboard read', async () => {
    const options = await dashboardSetup(true)
    const { readCustomerDashboard } = await import('~~/server/utils/pageStudio/customerDashboard')
    const before = (await db.query('SELECT COUNT(*) FROM page_studio_sites')).rows[0].count
    const result = await readCustomerDashboard(token, options)
    expect(result).toMatchObject({ businessName: 'Customer Flowers', state: 'available', canCreate: true })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_sites')).rows[0].count).toBe(before)
    expect(options.binding.createProvisioning).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(fixture.workspaceId)
  })

  it('keeps disabled or unapproved customer previews closed', async () => {
    const options = await dashboardSetup(true)
    const { readCustomerDashboard, createCustomerDashboardPreview } = await import('~~/server/utils/pageStudio/customerDashboard')
    for (const unavailable of [{ ...options, enabled: false }, { ...options, approval: null }, { ...options, approval: { ...options.approval, workspaceId: randomUUID() } }]) {
      expect((await readCustomerDashboard(token, unavailable)).canCreate).toBe(false)
      await expect(createCustomerDashboardPreview(token, unavailable)).rejects.toMatchObject({ statusCode: 403 })
    }
    expect(options.binding.createProvisioning).not.toHaveBeenCalled()
  })

  it('creates and retries one customer site/intent from saved setup without caller scope', async () => {
    const options = await dashboardSetup(true)
    const { createCustomerDashboardPreview } = await import('~~/server/utils/pageStudio/customerDashboard')
    const first = await createCustomerDashboardPreview(token, options)
    await createCustomerDashboardPreview(token, options)
    expect(first).toMatchObject({ state: 'preparing', canCreate: false })
    expect(options.binding.createProvisioning).toHaveBeenCalledTimes(1)
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_provisioning_intents')).rows[0].count).toBe('1')
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_site_requests WHERE workspace_id = $1', [fixture.workspaceId])).rows[0].count).toBe('1')
  })

  it('returns only verification pending for completed jobs and no provider secrets', async () => {
    const options = await dashboardSetup()
    const job = await prepare()
    options.binding.readProvisioning.mockResolvedValue({ ...job, phase: 'complete', resources: { database: 'secret-db', site: 'private-site', contentBinding: 'private-binding' } })
    const { readCustomerDashboard } = await import('~~/server/utils/pageStudio/customerDashboard')
    const result = await readCustomerDashboard(token, options)
    expect(result).toMatchObject({ state: 'verification-pending', canCreate: false, canRetry: false })
    for (const secret of ['secret-db', 'private-site', 'private-binding', hash(token), ids.owner, fixture.siteId, 'launchUrl']) expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('denies a revoked session and suppresses access lost during the provider read', async () => {
    const options = await dashboardSetup()
    const job = await prepare()
    const { readCustomerDashboard } = await import('~~/server/utils/pageStudio/customerDashboard')
    options.binding.readProvisioning.mockImplementationOnce(async () => {
      await db.query('UPDATE page_studio_workspace_memberships SET revoked_at = NOW()')
      return job
    })
    await expect(readCustomerDashboard(token, options)).rejects.toMatchObject({ statusCode: 403 })
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at = NOW()')
    await expect(readCustomerDashboard(token, options)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('sanitizes forged coordinator plans and does not treat provider failure as empty setup', async () => {
    const options = await dashboardSetup()
    const job = await prepare()
    const { readCustomerDashboard } = await import('~~/server/utils/pageStudio/customerDashboard')
    options.binding.readProvisioning.mockResolvedValueOnce({ ...job, setup: { ...job.setup, businessName: 'Foreign' } })
    expect(await readCustomerDashboard(token, options)).toMatchObject({ state: 'needs-attention', canCreate: false, canRetry: false })
    options.binding.readProvisioning.mockRejectedValueOnce(new Error('private provider failure'))
    const result = await readCustomerDashboard(token, options)
    expect(result).toMatchObject({ state: 'unavailable', canCreate: false, canRetry: false })
    expect(JSON.stringify(result)).not.toContain('private provider failure')
  })

  it('requires support instead of replacing a logged-out initiating session', async () => {
    const options = await dashboardSetup()
    await prepare()
    const next = 'b'.repeat(64)
    await db.query(`INSERT INTO page_studio_customer_sessions (token_hash, account_id, expires_at)
      SELECT $1, account_id, expires_at FROM page_studio_customer_sessions WHERE token_hash = $2`, [hash(next), hash(token)])
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at = NOW() WHERE token_hash = $1', [hash(token)])
    const { readCustomerDashboard } = await import('~~/server/utils/pageStudio/customerDashboard')
    expect(await readCustomerDashboard(next, options)).toMatchObject({ state: 'needs-attention', canRetry: false })
    expect(options.binding.readProvisioning).not.toHaveBeenCalled()
  })

  it('retains one native customer login and content-only plan across concurrent retries', async () => {
    const jobs = await Promise.all([prepare(), prepare(), prepare()])
    expect(jobs[1]).toEqual(jobs[0])
    expect(jobs[2]).toEqual(jobs[0])
    expect(jobs[0]).toMatchObject({ actor: { kind: 'customer-user', userId: ids.owner, loginSessionHash: hash(token) },
      generationVersion: 2, phase: 'requested', plan: { enabledModules: ['business-content'], pages: ['home', 'about', 'contact'] },
      scope: { environment: 'staging', siteId: fixture.siteId } })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_provisioning_intents')).rows[0].count).toBe('1')
    expect((await db.query('SELECT COUNT(*) FROM client_users')).rows[0].count).toBe('0')
    await expect(verify(jobs[0])).resolves.toMatchObject({ userId: ids.owner })
    await expect(db.query(`UPDATE page_studio_customer_provisioning_intents SET job = '{}'`)).rejects.toThrow('append-only')
  })

  it.each(['session', 'account', 'identity', 'verification', 'membership', 'role', 'workspace', 'entitlement', 'expiry', 'approver', 'limits'])('denies revoked %s at each provider phase and on replay', async (reason) => {
    const job = await prepare()
    const mutations: Record<string, string> = {
      session: 'UPDATE page_studio_customer_sessions SET revoked_at = NOW()',
      account: 'UPDATE page_studio_customer_accounts SET status = \'suspended\'',
      identity: 'UPDATE page_studio_customer_identities SET status = \'suspended\'',
      verification: 'UPDATE page_studio_customer_identities SET verified_at = NULL',
      membership: 'UPDATE page_studio_workspace_memberships SET revoked_at = NOW()',
      role: 'UPDATE page_studio_workspace_memberships SET role = \'editor\'',
      workspace: 'UPDATE page_studio_customer_workspaces SET status = \'suspended\'',
      entitlement: 'UPDATE page_studio_entitlements SET status = \'suspended\'',
      expiry: 'UPDATE page_studio_entitlements SET effective_until = NOW() - INTERVAL \'1 second\'',
      approver: 'UPDATE team_members SET is_active = FALSE',
      limits: 'UPDATE page_studio_entitlements SET monthly_ai_operation_limit = 100'
    }
    await db.query(mutations[reason]!)
    for (const phase of ['requested', 'validated', 'resources-created', 'site-seeded', 'content-seeded']) {
      await expect(verify({ ...job, phase })).rejects.toMatchObject({ statusCode: 403 })
    }
    await expect(prepare()).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects forged plan, actor, login, scope, environment and missing native intent', async () => {
    const job = await prepare()
    for (const changed of [
      { ...job, actor: { ...job.actor, userId: ids.other } },
      { ...job, actor: { ...job.actor, loginSessionHash: 'b'.repeat(64) } },
      { ...job, plan: { ...job.plan, pages: ['home'] } },
      { ...job, setup: { ...job.setup, businessName: 'Forged business' } },
      { ...job, scope: { ...job.scope, tenantId: 'foreign' } },
      { ...job, generationVersion: undefined }
    ]) await expect(verify(changed)).rejects.toMatchObject({ statusCode: 403 })
    await expect(verify(job, 'production')).rejects.toMatchObject({ statusCode: 403 })
    await db.query('TRUNCATE page_studio_customer_provisioning_intents')
    await expect(verify(job)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('cannot revive an intent with a new login after original-session logout', async () => {
    const job = await prepare()
    const next = 'b'.repeat(64)
    await db.query(`INSERT INTO page_studio_customer_sessions (token_hash, account_id, expires_at)
      SELECT $1, account_id, expires_at FROM page_studio_customer_sessions WHERE token_hash = $2`, [hash(next), hash(token)])
    expect(await prepare(next)).toEqual(job)
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at = NOW() WHERE token_hash = $1', [hash(token)])
    await expect(prepare(next)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('reconciles a lost coordinator acknowledgement without creating another request', async () => {
    const api = await import('~~/server/utils/pageStudio/customerProvisioning')
    let retained: unknown = null
    let writes = 0
    const binding = { readProvisioning: async () => retained, createProvisioning: async (job: unknown) => {
      retained = job
      writes++
      throw new Error('lost response')
    } }
    const result = await api.dispatchCustomerProvisioning({ sessionToken: token, siteId: fixture.siteId }, { runTransaction, binding })
    expect(result.actor?.kind).toBe('customer-user')
    await api.dispatchCustomerProvisioning({ sessionToken: token, siteId: fixture.siteId }, { runTransaction, binding })
    expect(writes).toBe(1)
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_provisioning_intents')).rows[0].count).toBe('1')
  })

  it('commits a scoped first checkpoint under customer authority and rejects replay after logout', async () => {
    const job = { ...await prepare(), phase: 'content-seeded' as const }
    const checkpointId = `setup_${'c'.repeat(64)}`
    const input = { provisioning: { requestKey: job.requestKey, scope: job.scope }, expectedCheckpointId: null,
      checkpoint: { checkpointId, scope: { tenantId: job.scope.tenantId, clientId: job.scope.clientId, siteId: job.scope.siteId },
        userId: ids.owner, createdAt: new Date().toISOString(), digest: 'd'.repeat(64), etag: 'etag',
        objectKey: `tenants/${job.scope.tenantId}/clients/${job.scope.clientId}/sites/${job.scope.siteId}/checkpoints/${checkpointId}.json` } }
    const { commitPageStudioProvisioningCheckpoint } = await import('~~/server/utils/pageStudio/provisioningCheckpoint')
    const binding = { readProvisioning: async () => job, createProvisioning: async () => job }
    const commit = () => commitPageStudioProvisioningCheckpoint(input, binding, 'staging', { runTransaction })
    await expect(commit()).resolves.toMatchObject({ acknowledged: true, isCurrent: true })
    const audit = (await db.query(`SELECT metadata FROM page_studio_audit_events WHERE resource_id = $1`, [checkpointId])).rows[0]
    expect(audit.metadata.customerProvisioning).toMatchObject({ userId: ids.owner, requestKey: job.requestKey, loginSessionHash: hash(token) })
    expect(audit.metadata.stagingOrigin).toBeUndefined()
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at = NOW()')
    await expect(commit()).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_checkpoints')).rows[0].count).toBe('1')
  })
  it('keeps two customer intents isolated and rejects cross-customer prepare and forged scope', async () => {
    const secondToken = 'b'.repeat(64), accountId = randomUUID()
    await db.query('UPDATE page_studio_customer_identities SET subject = $1 WHERE id = $2', [accountId, ids.other])
    await db.query(`INSERT INTO page_studio_customer_accounts (id, email, name, identity_id, status, terms_version)
      VALUES ($1, 'second@example.test', 'Second', $2, 'active', 'v1')`, [accountId, ids.other])
    await db.query(`INSERT INTO page_studio_customer_sessions (token_hash, account_id, expires_at)
      VALUES ($1, $2, clock_timestamp() + INTERVAL '1 day')`, [hash(secondToken), accountId])
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    const policy = (await db.query('SELECT preview_policy FROM page_studio_customer_site_requests WHERE site_id = $1', [fixture.siteId])).rows[0].preview_policy
    const other = await createCustomerPreviewSite({ workspaceId: await workspace(ids.other), identityId: ids.other,
      requestId: randomUUID(), name: 'Second Flowers', route: 'flowers', starterVersion: 'floristry-v1' }, { runTransaction, previewPolicy: policy })
    const first = await prepare(), second = await prepare(secondToken, other.site.id)
    expect(first.scope.businessId).not.toBe(second.scope.businessId)
    await expect(verify(first)).resolves.toMatchObject({ userId: ids.owner })
    await expect(verify(second)).resolves.toMatchObject({ userId: ids.other })
    await expect(prepare(token, other.site.id)).rejects.toMatchObject({ statusCode: 403 })
    await expect(prepare(secondToken)).rejects.toMatchObject({ statusCode: 403 })
    await db.query(`INSERT INTO page_studio_workspace_memberships (workspace_id, identity_id, role) VALUES ($1, $2, 'owner')`, [fixture.workspaceId, ids.other])
    await expect(prepare(secondToken)).rejects.toMatchObject({ statusCode: 403 })
    await expect(verify({ ...first, scope: second.scope, plan: { ...first.plan, scope: second.scope } })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rechecks logout between external preflight and checkpoint transaction before writing', async () => {
    const job = { ...await prepare(), phase: 'content-seeded' as const }
    const checkpointId = `setup_${'e'.repeat(64)}`
    const input = { provisioning: { requestKey: job.requestKey, scope: job.scope }, expectedCheckpointId: null,
      checkpoint: { checkpointId, scope: { tenantId: job.scope.tenantId, clientId: job.scope.clientId, siteId: job.scope.siteId },
        userId: ids.owner, createdAt: new Date().toISOString(), digest: 'f'.repeat(64), etag: 'etag',
        objectKey: `tenants/${job.scope.tenantId}/clients/${job.scope.clientId}/sites/${job.scope.siteId}/checkpoints/${checkpointId}.json` } }
    const { commitPageStudioProvisioningCheckpoint } = await import('~~/server/utils/pageStudio/provisioningCheckpoint')
    const revokedRun = async <T>(callback: (client: pg.Client) => Promise<T>) => {
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at = clock_timestamp()')
      return runTransaction(callback)
    }
    await expect(commitPageStudioProvisioningCheckpoint(input, { readProvisioning: async () => job, createProvisioning: async () => job },
      'staging', { runTransaction: revokedRun })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_checkpoints')).rows[0].count).toBe('0')
  })
})
