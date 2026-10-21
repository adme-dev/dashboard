import { comparePlacedCustomerEditorAuthority } from '../../helpers/comparePlacedCustomerEditorAuthority'
import { attachCmsManagement } from '../../helpers/pageStudioCmsManagement'
import { nativePreviewBindings } from '../../utils/pageStudioNativePreview'
import { handleNativeSchemaCoordinatorFetch } from '../../../workers/page-studio-management/src/nativeSchemaCoordinator'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: native.transaction, transactionWithoutRetry: native.transaction }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const ownershipMigration = '444_page_studio_customer_site_ownership.sql'
const ids = { owner: randomUUID(), other: randomUUID(), client: randomUUID(), staff: randomUUID() }

describe.runIf(Boolean(databaseUrl))('native CMS setup admission on PostgreSQL', () => {
  const schema = `customer_setup_${randomUUID().replaceAll('-', '')}`
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
    await db.query(migration('448_page_studio_customer_cms_setup.sql'))
    await db.query(migration('456_page_studio_customer_editor_environment.sql'))
    await db.query(migration('448_page_studio_customer_cms_setup.sql'))
    await db.query(migration('404_page_studio_documents.sql'))
    await db.query(migration('422_page_studio_cms_visibility.sql'))
    await db.query(migration('425_page_studio_cms_authoring_scope.sql'))
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
  const config = { enabled: true, dashboardOrigin: 'https://app.xeroflow.io', editorOrigin: 'https://studio.example.test' }
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
    return comparePlacedCustomerEditorAuthority(claims, capability, fixture.workspaceId, config.editorOrigin, runTransaction)
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
  const approve = async (seconds: number | null = null) => db.query(`INSERT INTO page_studio_customer_cms_setup_approvals
    (workspace_id,site_id,identity_id,tenant_id,business_id,approved_by,preview_policy,expires_at)
    SELECT workspace_id,site_id,$3,tenant_id,business_id,(preview_policy->>'approvedBy')::uuid,preview_policy,
      LEAST((preview_policy->>'expiresAt')::timestamptz,COALESCE(clock_timestamp()+$4*INTERVAL '1 second',(preview_policy->>'expiresAt')::timestamptz)) FROM page_studio_customer_site_requests WHERE workspace_id=$1 AND site_id=$2`, [fixture.workspaceId, fixture.siteId, ids.owner, seconds])
  const setupTicket = async () => {
    const api = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    return api.issueCustomerCmsSetupHandoff(token, config, { runTransaction })
  }
  const setupSession = async () => {
    await approve()
    const value = await exchange((await setupTicket()).token)
    const { verifyCustomerEditorToken } = await import('~~/server/utils/pageStudio/customerEditorToken')
    return verifyCustomerEditorToken(value.token, publicPem, issuer)
  }
  const bootstrap = async () => {
    const editor = await session()
    await commit(editor.claims, { checkpoint: checkpoint(editor.claims), expectedCheckpointId: null })
    const { prepareCustomerProvisioning } = await import('~~/server/utils/pageStudio/customerProvisioning')
    const job = await prepareCustomerProvisioning({ sessionToken: token, siteId: fixture.siteId }, { runTransaction })
    const provider = { ...job, phase: 'complete', resources: { site: fixture.siteId, database: randomUUID(), contentBinding: `ps-content-${'b'.repeat(32)}` } }
    return { job, provider, options: { configuration: config, runTransaction, signToken: async (claims: import('~~/server/utils/pageStudio/customerEditorToken').CustomerEditorClaims) => (await import('~~/server/utils/pageStudio/customerEditorToken')).signCustomerEditorToken(claims, privatePem, issuer),
      env: { PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED: 'true', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_PROVISIONER: { readProvisioning: vi.fn(async () => provider) } } } }
  }
  const setupApi = () => import('~~/server/utils/pageStudio/customerCmsSetup')
  const availabilityOptions = () => ({ configuration: config, runTransaction,
    env: { PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED: 'true', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' } })
  it('hides CMS setup for an expired preview without blocking the authenticated owner overview', async () => {
    const api = await setupApi()
    await db.query('UPDATE page_studio_entitlements SET effective_from=clock_timestamp()-INTERVAL \'2 days\', effective_until=clock_timestamp()-INTERVAL \'1 day\'')
    await expect(api.customerCmsSetupAvailable(token, availabilityOptions())).resolves.toBe(false)
    await expect(api.readCustomerCmsSetup(token, availabilityOptions())).rejects.toMatchObject({ statusCode: 403 })
  })
  it('hides CMS setup before an owner has created a preview', async () => {
    const api = await setupApi()
    await db.query('UPDATE page_studio_customer_setup_drafts SET workspace_id=$1', [await workspace()])
    await expect(api.customerCmsSetupAvailable(token, availabilityOptions())).resolves.toBe(false)
  })
  it.each(['owner', 'membership', 'workspace', 'parent'] as const)('still rejects withdrawn %s access when CMS setup is unavailable', async (reason) => {
    const api = await setupApi()
    const mutations = {
      owner: 'UPDATE page_studio_workspace_memberships SET role=\'viewer\'',
      membership: 'UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()',
      workspace: 'UPDATE page_studio_customer_workspaces SET status=\'suspended\'',
      parent: 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()'
    }
    await db.query(mutations[reason])
    await expect(api.customerCmsSetupAvailable(token, availabilityOptions())).rejects.toMatchObject({ statusCode: reason === 'parent' ? 401 : 403 })
  })
  it('GET requires resume without minting, concurrent explicit resumes reuse exactly one setup child', async () => {
    await approve()
    const { options } = await bootstrap(), api = await setupApi()
    expect(await api.readCustomerCmsSetup(token, options)).toEqual({ resumeRequired: true, prerequisites: [], adoption: null })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_editor_handoffs WHERE purpose=\'cms-setup\'')).rows[0].count).toBe('0')
    expect(await Promise.all([api.mutateCustomerCmsSetup(token, { operation: 'resume' }, options), api.mutateCustomerCmsSetup(token, { operation: 'resume' }, options)])).toEqual([{ resumed: true }, { resumed: true }])
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_editor_handoffs WHERE purpose=\'cms-setup\'')).rows[0].count).toBe('1')
  })
  it.each(['incomplete', 'resource', 'withdrawal', 'checkpoint'])('rejects %s during the provider observation without issuing setup authority', async (reason) => {
    await approve()
    const { options, provider } = await bootstrap(), api = await setupApi()
    options.env.PAGE_STUDIO_PROVISIONER.readProvisioning.mockImplementationOnce(async () => {
      if (reason === 'incomplete') return { ...provider, phase: 'content-seeded' }
      if (reason === 'resource') return { ...provider, resources: { ...provider.resources, site: randomUUID() } }
      if (reason === 'withdrawal') await db.query('UPDATE page_studio_customer_cms_setup_approvals SET enabled=FALSE')
      if (reason === 'checkpoint') await db.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
      return provider
    })
    await expect(api.mutateCustomerCmsSetup(token, { operation: 'resume' }, options)).rejects.toBeDefined()
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_editor_handoffs WHERE purpose=\'cms-setup\'')).rows[0].count).toBe('0')
  })
  it('clamps to immutable approval deadline and denies expiry during a gate lock wait', async () => {
    await approve(1.5)
    const claims = (await exchange((await setupTicket()).token))
    const { verifyCustomerEditorToken } = await import('~~/server/utils/pageStudio/customerEditorToken')
    const parsed = await verifyCustomerEditorToken(claims.token, publicPem, issuer)
    expect(parsed.expiresAt - parsed.issuedAt).toBeLessThanOrEqual(2)
    const holder = new pg.Client({ connectionString: databaseUrl })
    await holder.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SET LOCAL search_path TO "${schema}",pg_catalog`)
      await holder.query('SELECT id FROM page_studio_customer_cms_setup_approvals FOR UPDATE')
      const result = Promise.allSettled([authorize(parsed, 'cms:prepare')])
      await vi.waitFor(async () => expect((await db.query('SELECT expires_at<clock_timestamp() AS expired FROM page_studio_customer_cms_setup_approvals')).rows[0].expired).toBe(true), { timeout: 3000, interval: 20 })
      await holder.query('COMMIT')
      expect((await result)[0]).toMatchObject({ status: 'rejected', reason: { statusCode: 403 } })
    } finally {
      await holder.query('ROLLBACK')
      await holder.end()
    }
  })
  it('retains withdrawal tombstones and denies resurrection', async () => {
    await approve()
    await db.query('UPDATE page_studio_customer_cms_setup_approvals SET enabled=FALSE')
    await expect(db.query('DELETE FROM page_studio_customer_cms_setup_approvals')).rejects.toThrow('tombstones')
    await expect(db.query('UPDATE page_studio_customer_cms_setup_approvals SET enabled=TRUE')).rejects.toThrow('immutable')
  })
  it('forbids broadening an existing approval or renewing its deadline', async () => {
    await approve()
    for (const sql of ['UPDATE page_studio_customer_cms_setup_approvals SET expires_at=expires_at+INTERVAL \'1 minute\'', 'UPDATE page_studio_customer_cms_setup_approvals SET identity_id=\'00000000-0000-4000-8000-000000000001\''])
      await expect(db.query(sql)).rejects.toThrow('immutable')
  })
  it('denies setup without an exact current staging approval', async () => {
    await expect(setupTicket()).rejects.toMatchObject({ statusCode: 403 })
    await approve()
    await expect(setupTicket()).resolves.toHaveProperty('token')
  })
  it('derives exactly two setup capabilities and a fifteen-minute deadline', async () => {
    const claims = await setupSession()
    expect(claims.capabilities).toEqual(['cms:prepare', 'cms:adopt'])
    expect(claims.expiresAt - claims.issuedAt).toBeLessThanOrEqual(900)
    expect(claims).not.toHaveProperty('purpose')
    await expect(authorize(claims, 'cms:prepare')).resolves.toBeDefined()
    await expect(authorize(claims, 'cms:adopt')).resolves.toBeDefined()
    for (const cap of ['workspace:create', 'workspace:checkpoint', 'workspace:reconnect', 'workspace:preview', 'workspace:terminate', 'workspace:status'])
      await expect(authorize(claims, cap)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('keeps ordinary editor capabilities and claim shape unchanged', async () => {
    const { claims } = await session()
    expect(claims.capabilities).toEqual(['workspace:create', 'workspace:reconnect', 'workspace:checkpoint', 'workspace:preview', 'workspace:terminate', 'workspace:status'])
    expect(claims.expiresAt - claims.issuedAt).toBe(14400)
    await expect(authorize(claims, 'cms:prepare')).rejects.toMatchObject({ statusCode: 403 })
    await expect(authorize(claims, 'cms:adopt')).rejects.toMatchObject({ statusCode: 403 })
  })
  it('makes handoff purpose immutable', async () => {
    await approve()
    await setupTicket()
    await expect(db.query('UPDATE page_studio_customer_editor_handoffs SET purpose=\'editor\'')).rejects.toThrow('immutable')
  })
  it.each(['approval', 'owner', 'parent'])('rejects %s changes after setup admission', async (reason) => {
    const claims = await setupSession()
    const mutations = {
      approval: 'UPDATE page_studio_customer_cms_setup_approvals SET enabled=FALSE',
      deadline: 'UPDATE page_studio_customer_cms_setup_approvals SET expires_at=clock_timestamp()-INTERVAL \'1 second\'',
      owner: 'UPDATE page_studio_workspace_memberships SET role=\'viewer\'',
      parent: 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()'
    }
    await db.query(mutations[reason])
    await expect(authorize(claims, 'cms:prepare')).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects mixed and forged claims without accepting setup as checkpoint authority', async () => {
    const claims = await setupSession()
    await expect(authorize({ ...claims, capabilities: ['cms:prepare', 'workspace:create'] }, 'cms:prepare')).rejects.toMatchObject({ statusCode: 403 })
    await expect(authorize({ ...claims, siteId: randomUUID() }, 'cms:prepare')).rejects.toMatchObject({ statusCode: 403 })
    await expect(commit(claims, { checkpoint: checkpoint(claims), expectedCheckpointId: null })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('composes all five placed statuses and first/resumed Forms POST with counted SQL and explicit HTTP overhead', async () => {
    await approve()
    const { options: baselineOptions } = await bootstrap(), api = await setupApi()
    const counts = { public: 0, management: 0, publicTransactions: 0, managementTransactions: 0 }
    let measured = false, studioMs = 0, privateCalls = 0, studioCalls = 0, formCalls = 0
    const run = (bucket: 'public' | 'management') => async <T>(work: (client: import('~~/server/utils/pageStudio/sites').PageStudioQueryClient) => Promise<T>) => {
      if (measured) {
        counts[bucket] += 2
        counts[bucket === 'public' ? 'publicTransactions' : 'managementTransactions']++
      }
      return runTransaction(client => work({ query: async (sql, params) => {
        if (measured) counts[bucket]++
        return client.query(sql, params) as never
      } }))
    }
    const options = { ...baselineOptions, runTransaction: run('public') }
    const binding = options.env.PAGE_STUDIO_PROVISIONER as Record<string, (input: unknown) => Promise<unknown>>
    const env = options.env as Record<string, unknown>
    binding.createProvisioning = async () => {
      throw new Error('No provisioning mutation in this test')
    }
    Object.assign(env, nativePreviewBindings(binding), { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production',
      PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsTarget() { throw new Error('Idle status must not discover an adoption target') } },
      PAGE_STUDIO_CHECKPOINTS: { get() { throw new Error('Idle status must not read objects') } } })
    attachCmsManagement(env, run('management'))
    const management = env.PAGE_STUDIO_MANAGEMENT as { cmsAuthoring: (input: unknown) => Promise<unknown>, fetch?: (request: Request) => Promise<Response> }
    const adoption = management.cmsAuthoring
    const status = management.fetch!
    const { CMS_STATUS_URL } = await import('~~/shared/pageStudio/cmsStatusTransport')
    management.cmsAuthoring = (input) => {
      if (measured) privateCalls++
      return adoption(input)
    }
    management.fetch = (request) => {
      if (measured) privateCalls++
      return request.url === CMS_STATUS_URL ? status(request) : handleNativeSchemaCoordinatorFetch(request, env, run('management'))
    }
    const contracts = Object.values(await import('~~/server/utils/pageStudio/schemaUpgradeContract'))
    // Composed, not hosted: exact Studio public-entry ledger from form-drafts-status-budget.test.ts.
    // D1=250ms, fresh native=300ms, inspect=10s, physical=1s, each pinned R2 object=1s.
    const costs: Record<string, number> = { 'collection': 1650, 'workflow': 1050, 'collection-staging': 1300, 'form-runtime': 20150, 'form-drafts': 53950 }
    for (const contract of contracts) {
      binding[contract.discoveryMethod] = async (scope) => {
        if (measured) {
          studioCalls++
          if (contract.kind === 'form-drafts') studioMs += 51900
        }
        return { scope, accountId: 'a'.repeat(32), databaseId: '11111111-1111-4111-8111-111111111111', name: `ps-content-${'b'.repeat(32)}`,
          ...(contract.kind !== 'collection' ? { collectionOperationId: 'collection_original' } : {}),
          ...(['collection-staging', 'form-runtime', 'form-drafts'].includes(contract.kind) ? { workflowOperationId: 'workflow_original' } : {}),
          ...(contract.kind.startsWith('form-') ? { stagingOperationId: 'staging_original' } : {}),
          ...(contract.kind === 'form-drafts' ? { runtime: { digest: 'd'.repeat(64), etag: 'verified-etag', successorIdentity: 'e'.repeat(64) } } : {}) }
      }
      binding[contract.executeMethod] = async (intent) => {
        if (measured) studioCalls++
        if (contract.kind === 'form-drafts') {
          formCalls++
          if (measured) studioMs += formCalls === 1 ? 36200 : 93950
          if (formCalls === 1) return { status: 'running' }
        }
        return { status: 'installed', receipt: contract.expectedReceipt(intent as never) }
      }
      binding[contract.statusMethod] = async (intent) => {
        if (measured) {
          studioCalls++
          studioMs += contract.kind === 'form-drafts' && formCalls === 1 ? 33750 : costs[contract.kind]!
        }
        return contract.kind === 'form-drafts' && formCalls === 1
          ? { state: 'reserved', leaseUntil: null, receipt: null }
          : { state: 'installed', leaseUntil: null, receipt: contract.expectedReceipt(intent as never) }
      }
    }
    await api.mutateCustomerCmsSetup(token, { operation: 'resume' }, options)
    for (const contract of contracts.filter(value => value.kind !== 'form-drafts')) await api.mutateCustomerCmsSetup(token, { operation: 'schema', request: { action: 'start', kind: contract.kind, requestId: randomUUID() } }, options)
    const ledger: Record<string, unknown>[] = []
    const record = async (phase: string, post: boolean, work: () => Promise<unknown>) => {
      Object.assign(counts, { public: 0, management: 0, publicTransactions: 0, managementTransactions: 0 })
      studioMs = 0
      privateCalls = 0
      studioCalls = 0
      measured = true
      try {
        const result = await work()
        // Explicit scenario allowances, NOT latency guarantees. Actual public handler's rate limit is one fresh SQL query.
        const connectionMs = counts.publicTransactions * 500 + counts.managementTransactions * 100
        const transportMs = privateCalls * 500 + studioCalls * 500
        const provisioningMs = 750 // Actual readProvisioning performs one250ms D1 read plus500ms RPC allowance.
        const middlewareMs = (post ? 750 : 0) + 1000 + 250 // rate SQL+connect; browser/edge; serialization/CPU.
        const totalMs = studioMs + counts.public * 250 + counts.management * 10 + connectionMs + transportMs + provisioningMs + middlewareMs
        ledger.push({ phase, ...counts, studioMs, privateCalls, studioCalls, totalMs })
        expect(totalMs).toBeLessThan(125000)
        return result
      } finally { measured = false }
    }
    const requestId = randomUUID(), start = () => api.mutateCustomerCmsSetup(token, { operation: 'schema', request: { action: 'start', kind: 'form-drafts', requestId } }, options)
    expect(await record('first', true, start)).toMatchObject({ status: 'running', requestId })
    expect(await record('uncertain-refresh', false, () => api.readCustomerCmsSetup(token, options))).toMatchObject({ prerequisites: expect.arrayContaining([expect.objectContaining({ kind: 'form-drafts', status: 'reserved', requestId })]) })
    expect(formCalls).toBe(1) // GET never repeats the uncertain effect.
    expect(await record('resume', true, start)).toMatchObject({ status: 'installed', requestId })
    expect(await record('installed-refresh', false, () => api.readCustomerCmsSetup(token, options))).toMatchObject({ resumeRequired: false, adoption: { phase: 'idle' } })
    expect(ledger).toEqual([
      expect.objectContaining({ phase: 'first', public: 81, management: 110, totalMs: 115000 }),
      expect.objectContaining({ phase: 'uncertain-refresh', public: 96, management: 582, totalMs: 98320 }),
      expect.objectContaining({ phase: 'resume', public: 81, management: 110, totalMs: 120350 }),
      expect.objectContaining({ phase: 'installed-refresh', public: 96, management: 582, totalMs: 118520 })
    ])
    // Narrowest modeled margin4.65s; hosted acceptance remains required.
  })

  it.each(['binding', 'native-flag'])('production setup has no local coordinator fallback when %s is missing', async (missing) => {
    await approve()
    const { options } = await bootstrap(), api = await setupApi(), fetchPrivate = vi.fn()
    const env = options.env as Record<string, unknown>
    Object.assign(env, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_MANAGEMENT: { fetch: fetchPrivate } })
    await api.mutateCustomerCmsSetup(token, { operation: 'resume' }, options)
    if (missing === 'binding') delete env.PAGE_STUDIO_MANAGEMENT
    else delete env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED
    await expect(api.mutateCustomerCmsSetup(token, { operation: 'schema', request: { action: 'start', kind: 'collection', requestId: randomUUID() } }, options)).rejects.toMatchObject({ statusCode: 503 })
    await expect(api.readCustomerCmsSetup(token, options)).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchPrivate).not.toHaveBeenCalled()
    expect((await db.query('SELECT count(*) FROM page_studio_audit_events WHERE action=\'content.collection-upgrade.requested\'')).rows[0].count).toBe('0')
  })
})
