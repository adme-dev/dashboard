import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../../fixtures/pageStudioManagedTransferDestinationAuthoring.json'
import { collectionCanonical as canonical, collectionDigest as digest } from '~~/shared/pageStudio/collectionApi'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'

vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: () => {
  throw new Error('Disposable transaction required')
} }))
const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (url.hostname !== '127.0.0.1' || !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname) || url.search)
    throw new Error('Disposable localhost PG required')
}
describe.runIf(Boolean(databaseUrl))('current owner destination authoring authority on real PostgreSQL', () => {
  const schema = `destination_authoring_${randomUUID().replaceAll('-', '')}`, id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  let db: pg.Client
  const request = fixture.request, completion = request.completionReceipt, scope = completion.destination.scope
  const options = { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: JSON.stringify({ ...request.destinationRequest.policy, formReceiptDigest: undefined, accountId: request.destinationRequest.successor.accountId, namespace: request.destinationRequest.successor.namespace }) } }
  async function transaction<T>(work: (db: pg.Client) => Promise<T>) {
    const tx = new pg.Client({ connectionString: databaseUrl })
    await tx.connect()
    try {
      await tx.query('BEGIN')
      await tx.query(`SET LOCAL search_path TO ${schema},pg_catalog`)
      const result = await work(tx)
      await tx.query('COMMIT')
      return result
    } catch (error) {
      await tx.query('ROLLBACK')
      throw error
    } finally {
      await tx.end()
    }
  }
  const dependencies = () => ({ ...options, runTransaction: transaction })
  const module = () => import('~~/workers/page-studio-management/src/managedTransferDestinationAuthoring')
  beforeAll(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog;
 CREATE TABLE page_studio_customer_identities(id UUID,status TEXT,verified_at TIMESTAMPTZ,issuer TEXT,subject TEXT,portal_user_id UUID);
 CREATE TABLE page_studio_customer_accounts(id UUID,identity_id UUID,status TEXT);
 CREATE TABLE page_studio_customer_workspaces(id UUID,status TEXT);
 CREATE TABLE page_studio_workspace_memberships(identity_id UUID,workspace_id UUID,role TEXT,revoked_at TIMESTAMPTZ,expires_at TIMESTAMPTZ);
 CREATE TABLE page_studio_business_owners(id UUID,workspace_id UUID,agency_client_id UUID);
 CREATE TABLE page_studio_workspace_client_bindings(workspace_id UUID);
 CREATE TABLE page_studio_customer_site_requests(site_id UUID,workspace_id UUID,business_id UUID,tenant_id TEXT);
 CREATE TABLE page_studio_entitlements(id UUID,client_id UUID,tenant_id TEXT,status TEXT,plan_key TEXT,effective_from TIMESTAMPTZ,effective_until TIMESTAMPTZ,active_site_limit INTEGER,pages_per_site_limit INTEGER,plan_metadata JSONB);
 CREATE TABLE page_studio_sites(id UUID,client_id UUID,tenant_id TEXT,entitlement_id UUID,status TEXT);
 CREATE TABLE page_studio_customer_sessions(expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
 CREATE TABLE page_studio_login_sessions(expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
 CREATE TABLE page_studio_managed_transfer_intents(operation_id UUID,intent JSONB,intent_digest TEXT);
 CREATE TABLE page_studio_cms_scopes(scope_key TEXT,tenant_id TEXT,client_id UUID,site_id UUID,environment TEXT,state TEXT,retained_by_transfer_id UUID,transfer_id UUID,active_generation UUID,target JSONB,freeze_digest TEXT,current_application_id UUID,current_content_id UUID);
 CREATE TABLE page_studio_managed_transfer_completions(operation_id UUID,intent_digest TEXT,source_scope_key TEXT,source_generation UUID,destination_scope_key TEXT,destination_generation UUID,copy_proof_digest TEXT,history_receipt_digest TEXT,receipt JSONB,receipt_json TEXT,receipt_digest TEXT,audit_id UUID);
 CREATE TABLE page_studio_managed_transfer_copy_graph_verifications(operation_id UUID,intent_digest TEXT,proof_digest TEXT);
 CREATE TABLE page_studio_managed_transfer_destination_executions(operation_id UUID,intent_digest TEXT,request JSONB,request_json TEXT,request_digest TEXT,account_id TEXT,namespace TEXT,script_name TEXT);
 CREATE TABLE page_studio_managed_transfer_destination_execution_verifications(operation_id UUID,intent_digest TEXT,request_digest TEXT,proof JSONB,proof_json TEXT,proof_digest TEXT,execution_identity TEXT);
 CREATE TABLE page_studio_managed_transfer_forms_history_requests(operation_id UUID,intent_digest TEXT,source_request_digest TEXT,destination_proof_digest TEXT,request JSONB,request_json TEXT,request_digest TEXT,expected_receipt JSONB,expected_receipt_json TEXT,expected_receipt_digest TEXT);
 CREATE TABLE page_studio_managed_transfer_forms_history_verifications(operation_id UUID,intent_digest TEXT,request_digest TEXT,receipt JSONB,receipt_json TEXT,receipt_digest TEXT);`)
  })
  async function insert(table: string, value: Record<string, unknown>) {
    const keys = Object.keys(value)
    await db.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map(key => value[key]))
  }
  beforeEach(async () => {
    const tables = (await db.query('SELECT tablename FROM pg_tables WHERE schemaname=$1', [schema])).rows.map(r => r.tablename)
    await db.query(`TRUNCATE ${tables.join(',')}`)
    await insert('page_studio_customer_identities', { id: id(201), status: 'active', verified_at: new Date(Date.now() - 100000), issuer: 'studio', subject: id(202), portal_user_id: null })
    await insert('page_studio_customer_accounts', { id: id(202), identity_id: id(201), status: 'active' })
    await insert('page_studio_customer_workspaces', { id: id(203), status: 'active' })
    await insert('page_studio_workspace_memberships', { identity_id: id(201), workspace_id: id(203), role: 'owner', revoked_at: null, expires_at: null })
    await insert('page_studio_business_owners', { id: scope.businessId, workspace_id: id(203), agency_client_id: null })
    await insert('page_studio_customer_site_requests', { site_id: scope.siteId, workspace_id: id(203), business_id: scope.businessId, tenant_id: scope.tenantId })
    await insert('page_studio_entitlements', { id: id(204), client_id: scope.clientId, tenant_id: scope.tenantId, status: 'active', plan_key: 'studio_business', effective_from: new Date(Date.now() - 100000), effective_until: null, active_site_limit: 1, pages_per_site_limit: 10, plan_metadata: { publishingEnabled: true, managedBy: 'platform', allowedModules: ['business-content'] } })
    await insert('page_studio_sites', { id: scope.siteId, client_id: scope.clientId, tenant_id: scope.tenantId, entitlement_id: id(204), status: 'active' })
    await db.query('INSERT INTO page_studio_customer_sessions VALUES(clock_timestamp()-interval \'1 day\',clock_timestamp());INSERT INTO page_studio_login_sessions VALUES(clock_timestamp()-interval \'1 day\',clock_timestamp())')
    await insert('page_studio_managed_transfer_intents', { operation_id: request.operationId, intent: fixture.intent, intent_digest: request.intentDigest })
    for (const [name, endpoint] of Object.entries({ source: completion.source, destination: completion.destination })) {
      await insert('page_studio_cms_scopes', { scope_key: contentScopeKey(endpoint.scope as never), tenant_id: endpoint.scope.tenantId, client_id: endpoint.scope.clientId, site_id: endpoint.scope.siteId, environment: endpoint.scope.environment, state: name === 'source' ? 'retained' : 'managed', retained_by_transfer_id: name === 'source' ? request.operationId : null, transfer_id: name === 'destination' ? request.operationId : null, active_generation: endpoint.generation, target: endpoint.target, freeze_digest: endpoint.freezeDigest, current_application_id: endpoint.application.id, current_content_id: endpoint.contentId })
    }
    await insert('page_studio_managed_transfer_completions', { operation_id: request.operationId, intent_digest: request.intentDigest, source_scope_key: contentScopeKey(completion.source.scope as never), source_generation: completion.source.generation, destination_scope_key: contentScopeKey(scope as never), destination_generation: completion.destination.generation, copy_proof_digest: completion.copyProofDigest, history_receipt_digest: completion.historyReceiptDigest, receipt: completion, receipt_json: canonical(completion), receipt_digest: completion.digest, audit_id: completion.auditId })
    await insert('page_studio_managed_transfer_copy_graph_verifications', { operation_id: request.operationId, intent_digest: request.intentDigest, proof_digest: completion.copyProofDigest })
    const execution = request.destinationRequest, proof = request.destinationProof, history = fixture.historyRequest, receipt = fixture.historyReceipt
    await insert('page_studio_managed_transfer_destination_executions', { operation_id: request.operationId, intent_digest: request.intentDigest, request: execution, request_json: canonical(execution), request_digest: await digest(execution), account_id: execution.successor.accountId, namespace: execution.successor.namespace, script_name: execution.successor.scriptName })
    await insert('page_studio_managed_transfer_destination_execution_verifications', { operation_id: request.operationId, intent_digest: request.intentDigest, request_digest: await digest(execution), proof, proof_json: canonical(proof), proof_digest: proof.digest, execution_identity: proof.envelope.execution.identity })
    await insert('page_studio_managed_transfer_forms_history_requests', { operation_id: request.operationId, intent_digest: request.intentDigest, source_request_digest: await digest(history.sourceRequest), destination_proof_digest: proof.digest, request: history, request_json: canonical(history), request_digest: await digest(history), expected_receipt: receipt, expected_receipt_json: canonical(receipt), expected_receipt_digest: receipt.digest })
    await insert('page_studio_managed_transfer_forms_history_verifications', { operation_id: request.operationId, intent_digest: request.intentDigest, request_digest: await digest(history), receipt, receipt_json: canonical(receipt), receipt_digest: receipt.digest })
  })
  afterAll(async () => {
    if (db) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`)
      await db.end()
    }
  })
  it('derives exact retained request and echoes both actions despite expired original customer/operator sessions', async () => {
    const m = await module()
    expect(await m.readManagedTransferDestinationAuthoring({ siteId: scope.siteId }, dependencies())).toEqual(request)
    for (const action of ['install', 'read'])
      expect(await m.authorizeManagedTransferDestinationAuthoring({ action, request }, dependencies())).toEqual({ action, request })
  })
  it('runs the exact private management wire under one fresh Worker database invocation', async () => {
    const { handleManagedTransferDestinationAuthoringManagement } = await import('~~/workers/page-studio-management/src/managedTransferDestinationAuthoringManagement')
    const authorization = { action: 'install', request }, wire = { action: 'authorize', expectedEnvironment: 'production', authorization }
    let transactions = 0
    const result = await handleManagedTransferDestinationAuthoringManagement(wire, options.env, work => transaction(async (db) => {
      transactions++
      return work(db)
    }))
    expect(result).toEqual({ ok: true, requestDigest: await digest(wire), value: authorization })
    expect(transactions).toBe(1)
  })
  it('placed authoring preserves exact transaction SQL and current-plan denial', async () => {
    const { handleManagedTransferAuthorityFetch } = await import('~~/workers/page-studio-management/src/managedTransferAuthority')
    const authorization = { action: 'install', request }, wire = { expectedEnvironment: 'production', input: authorization }
    const env = { ...options.env, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_PROVISIONER: { createProvisioning: async () => null, readProvisioning: async () => null } }
    const queries: unknown[][] = []
    let transactions = 0
    const run: typeof transaction = work => transaction(async (tx) => {
      transactions++
      return work({ query: async (sql: string, params?: unknown[]) => { queries.push([sql, structuredClone(params)]); return tx.query(sql, params) } } as pg.Client)
    })
    const direct = () => module().then(m => m.authorizeManagedTransferDestinationAuthoring(authorization, { env, runTransaction: run }))
    const placed = () => handleManagedTransferAuthorityFetch(new Request('https://page-studio-management.internal/internal/page-studio/managed-transfers/destination-authoring/authorize', { method: 'POST', body: JSON.stringify(wire) }), env, run)
    const expected = await direct(), expectedQueries = structuredClone(queries)
    queries.length = 0; transactions = 0
    const result = await placed()
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual(expected)
    expect(result.headers.get('x-request-digest')).toBe(await digest(wire))
    expect(queries).toEqual(expectedQueries)
    expect(transactions).toBe(1)
    await db.query("UPDATE page_studio_entitlements SET status='cancelled'")
    await expect(direct()).rejects.toMatchObject({ statusCode: 403 })
    expect((await placed()).status).toBe(403)
  })
  it('coordinates completed status/connect using real current-owner SQL with every RPC outside site locks', async () => {
    const { coordinateCompletedManagedTransfer } = await import('~~/workers/page-studio-management/src/completedManagedTransfer')
    let reads = 0, installs = 0
    const observe = async (ready: boolean) => {
      // Independent transaction must be able to acquire the site lock now.
      // A coordinator accidentally holding native locks across RPC times out.
      await transaction(async (tx) => {
        await tx.query('SET LOCAL lock_timeout=\'250ms\'')
        await tx.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR UPDATE NOWAIT', [scope.siteId])
      })
      return { operationId: request.operationId, intentDigest: request.intentDigest, requestDigest: await digest(request), state: ready ? 'ready' : 'not-started', ...(ready ? { grantDigest: fixture.grant.digest } : {}) }
    }
    const deps = { ...dependencies(), env: { ...options.env, PAGE_STUDIO_PROVISIONER: {
      readManagedTransferDestinationAuthoring: async () => {
        reads++
        return observe(installs > 0)
      },
      installManagedTransferDestinationAuthoring: async () => {
        installs++
        return observe(true)
      }
    } } }
    expect(await coordinateCompletedManagedTransfer({ siteId: scope.siteId, action: 'status' }, deps)).toEqual({ siteId: scope.siteId, completed: true, editorConnection: 'pending', sourceRetention: 'unavailable', canRetryConnection: true, canRetryRetention: false })
    expect(installs).toBe(0)
    expect(await coordinateCompletedManagedTransfer({ siteId: scope.siteId, action: 'connect' }, deps)).toEqual({ siteId: scope.siteId, completed: true, editorConnection: 'ready', sourceRetention: 'unavailable', canRetryConnection: false, canRetryRetention: false })
    expect(installs).toBe(1)
    expect(reads).toBe(2)
  })
  it('rejects current plan revocation during completed connection RPC before acknowledging progress', async () => {
    const { coordinateCompletedManagedTransfer } = await import('~~/workers/page-studio-management/src/completedManagedTransfer')
    const read = vi.fn(async () => {
      await db.query('UPDATE page_studio_entitlements SET status=\'disabled\'')
      return { operationId: request.operationId, intentDigest: request.intentDigest, requestDigest: await digest(request), state: 'ready', grantDigest: fixture.grant.digest }
    })
    await expect(coordinateCompletedManagedTransfer({ siteId: scope.siteId, action: 'status' }, { ...dependencies(), env: { ...options.env, PAGE_STUDIO_PROVISIONER: { readManagedTransferDestinationAuthoring: read } } })).rejects.toMatchObject({ statusCode: 403 })
    expect(read).toHaveBeenCalledTimes(1)
  })
  it.each(['UPDATE page_studio_customer_accounts SET status=\'disabled\'', 'UPDATE page_studio_customer_identities SET verified_at=NULL', 'UPDATE page_studio_customer_identities SET verified_at=clock_timestamp()+interval \'1 day\'', 'UPDATE page_studio_customer_identities SET issuer=\'legacy\'', 'UPDATE page_studio_customer_identities SET subject=\'other\'', 'UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()-interval \'1 second\'', 'UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()', 'UPDATE page_studio_workspace_memberships SET role=\'editor\'', 'UPDATE page_studio_customer_workspaces SET status=\'disabled\'', 'UPDATE page_studio_entitlements SET status=\'disabled\'', 'UPDATE page_studio_entitlements SET plan_metadata=\'{}\'', 'UPDATE page_studio_business_owners SET agency_client_id=gen_random_uuid()', 'INSERT INTO page_studio_workspace_client_bindings SELECT id FROM page_studio_customer_workspaces'])('denies revoked current native ownership/plan: %s', async (sql) => {
    await db.query(sql)
    await expect((await module()).authorizeManagedTransferDestinationAuthoring({ action: 'read', request }, dependencies())).rejects.toThrow()
  })
  it.each(['completionReceipt', 'destinationRequest', 'destinationProof', 'historyReceipt', 'historyReceiptDigest', 'operationId', 'intentDigest', 'extra'])('denies tampered exact callback field %s', async (key) => {
    const wrong = structuredClone(request) as Record<string, unknown>
    wrong[key] = key === 'operationId' ? randomUUID() : key === 'extra' ? true : '0'.repeat(64)
    await expect((await module()).authorizeManagedTransferDestinationAuthoring({ action: 'install', request: wrong }, dependencies())).rejects.toThrow()
  })
  it.each(['page_studio_managed_transfer_destination_executions', 'page_studio_managed_transfer_destination_execution_verifications', 'page_studio_managed_transfer_forms_history_requests', 'page_studio_managed_transfer_forms_history_verifications', 'page_studio_managed_transfer_completions'])('requires retained prerequisite %s', async (table) => {
    await db.query(`DELETE FROM ${table}`)
    await expect((await module()).readManagedTransferDestinationAuthoring({ siteId: scope.siteId }, dependencies())).rejects.toThrow()
  })
  it('rejects changed current plan after immutable reads and rolls back that same transaction', async () => {
    const changed = async <T>(work: (db: pg.Client) => Promise<T>) => transaction(async (tx) => {
      const query = tx.query.bind(tx)
      let changed = false
      return work({ query: async (sql: string, args?: unknown[]) => {
        const result = await query(sql, args)
        if (!changed && sql.includes('page_studio_managed_transfer_destination_executions')) {
          changed = true
          await query('UPDATE page_studio_entitlements SET pages_per_site_limit=11')
        }
        return result
      } } as pg.Client)
    })
    await expect((await module()).readManagedTransferDestinationAuthoring({ siteId: scope.siteId }, { ...options, runTransaction: changed })).rejects.toThrow()
    expect((await db.query('SELECT pages_per_site_limit FROM page_studio_entitlements')).rows[0].pages_per_site_limit).toBe(10)
  })
  it.each([
    'UPDATE page_studio_managed_transfer_destination_executions SET request_json=request_json || \' \'',
    'UPDATE page_studio_managed_transfer_destination_execution_verifications SET request_digest=repeat(\'0\',64)',
    'UPDATE page_studio_managed_transfer_forms_history_requests SET expected_receipt_json=\'{}\'',
    'UPDATE page_studio_managed_transfer_forms_history_verifications SET receipt_digest=repeat(\'0\',64)',
    'UPDATE page_studio_cms_scopes SET freeze_digest=repeat(\'0\',64) WHERE environment=\'production\'',
    'UPDATE page_studio_cms_scopes SET active_generation=gen_random_uuid() WHERE environment=\'staging\''
  ])('rejects corrupt canonical or current completion association: %s', async (sql) => {
    await db.query(sql)
    await expect((await module()).readManagedTransferDestinationAuthoring({ siteId: scope.siteId }, dependencies())).rejects.toThrow()
  })
  it('permits legitimate later destination heads while preserving original generation and completion', async () => {
    await db.query('UPDATE page_studio_cms_scopes SET current_application_id=gen_random_uuid(),current_content_id=gen_random_uuid() WHERE environment=\'production\'')
    expect(await (await module()).readManagedTransferDestinationAuthoring({ siteId: scope.siteId }, dependencies())).toEqual(request)
  })
  it('does not grant authority to a self-consistently rehashed substituted completion', async () => {
    const wrong = structuredClone(request)
    wrong.completionReceipt.destination.generation = randomUUID()
    const { digest: _, ...body } = wrong.completionReceipt
    wrong.completionReceipt.digest = await digest(body)
    await expect((await module()).authorizeManagedTransferDestinationAuthoring({ action: 'read', request: wrong }, dependencies())).rejects.toThrow()
  })
  it('rejects trusted policy changes during the final current-owner read', async () => {
    const env = { ...options.env }
    let reads = 0
    const runTransaction = <T>(work: (db: pg.Client) => Promise<T>) => transaction(async (tx) => {
      const query = tx.query.bind(tx)
      return work({ query: async (sql: string, params?: unknown[]) => {
        const result = await query(sql, params)
        if (sql.includes('FROM page_studio_customer_accounts account') && ++reads === 3) {
          const policy = JSON.parse(env.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY)
          policy.to.digest = '0'.repeat(64)
          env.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY = JSON.stringify(policy)
        }
        return result
      } } as pg.Client)
    })
    await expect((await module()).readManagedTransferDestinationAuthoring({ siteId: scope.siteId }, { env, runTransaction })).rejects.toThrow()
  })
  it('does not permit staging or absent trusted current policy', async () => {
    const m = await module()
    for (const env of [{ ...options.env, PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging' }, { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }])
      await expect(m.readManagedTransferDestinationAuthoring({ siteId: scope.siteId }, { env, runTransaction: transaction })).rejects.toThrow()
  })
})
