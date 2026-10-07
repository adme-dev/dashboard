import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import type { CollectionUpgradeOperation } from '~~/shared/pageStudio/collection-upgrade'
import type { RunPageStudioTransaction } from '~~/server/utils/pageStudio/sites'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: native.transaction, transactionWithoutRetry: native.transaction }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const ownershipMigration = '444_page_studio_customer_site_ownership.sql'
const ids = { owner: randomUUID(), other: randomUUID(), client: randomUUID(), staff: randomUUID() }

describe.runIf(Boolean(databaseUrl))('native customer CMS prerequisites on PostgreSQL', () => {
  const schema = `customer_prereq_${randomUUID().replaceAll('-', '')}`
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
    await db.query(migration('404_page_studio_documents.sql'))
    await db.query(migration('422_page_studio_cms_visibility.sql'))
    await db.query(migration('425_page_studio_cms_authoring_scope.sql'))
    workspaces = await import('~~/server/utils/pageStudio/customerWorkspaces')
  })
  beforeEach(async () => {
    await db.query('DROP FUNCTION IF EXISTS fail_customer_pointer() CASCADE')
    await db.query('DROP FUNCTION IF EXISTS fail_customer_activation() CASCADE')
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
  beforeEach(async () => {
    const wid = await workspace()
    const accountId = randomUUID()
    await db.query(`UPDATE page_studio_customer_identities SET subject = $1 WHERE id = $2`, [accountId, ids.owner])
    await db.query(`INSERT INTO page_studio_customer_accounts (id, email, name, identity_id, status, terms_version)
      VALUES ($1, 'owner@example.test', 'Owner', $2, 'active', 'v1')`, [accountId, ids.owner])
    await db.query(`INSERT INTO page_studio_customer_sessions (token_hash, account_id, expires_at)
      VALUES ($1, $2, clock_timestamp() + INTERVAL '1 day')`, [hash(token), accountId])
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    await createCustomerPreviewSite({ workspaceId: wid, identityId: ids.owner, requestId: randomUUID(),
      name: 'Customer Flowers', route: 'flowers', starterVersion: 'floristry-v1' }, { runTransaction,
      previewPolicy: { approvalId: randomUUID(), approvedBy: ids.staff, expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        pagesPerSiteLimit: 5, storageBytesLimit: 104857600, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 1073741824 } })
    await db.query('INSERT INTO page_studio_customer_setup_drafts (identity_id, workspace_id, draft) VALUES ($1, $2, $3::jsonb)', [ids.owner, wid, JSON.stringify({ businessName: 'Customer Flowers', businessType: 'Florist', timezone: 'UTC', goals: ['enquiries'] })])
  })
  const config = { enabled: true, dashboardOrigin: 'https://customers.example.test', editorOrigin: 'https://studio.example.test' }
  const issuer = config.dashboardOrigin
  const ticket = async (sessionToken = token) => {
    const api = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    return api.issueCustomerEditorHandoff(sessionToken, config, { runTransaction })
  }
  const exchange = async (value: string, signOverride?: (claims: unknown) => Promise<string>) => {
    const api = await import('~~/server/utils/pageStudio/customerEditorSessions')
    const jwt = await import('~~/server/utils/pageStudio/customerEditorToken')
    return api.exchangeCustomerEditorSession(value, config, { runTransaction,
      signToken: signOverride ?? (claims => jwt.signCustomerEditorToken(claims, privatePem, issuer)) })
  }
  const session = async (sessionToken = token) => {
    const result = await exchange((await ticket(sessionToken)).token)
    const { verifyCustomerEditorToken } = await import('~~/server/utils/pageStudio/customerEditorToken')
    return { ...result, claims: await verifyCustomerEditorToken(result.token, publicPem, issuer) }
  }
  const contracts = async () => Object.values(await import('~~/server/utils/pageStudio/schemaUpgradeContract'))
  const api = () => import('~~/server/utils/pageStudio/customerSchemaUpgrade')
  const binding = () => {
    const calls: CollectionUpgradeOperation[] = []
    return { calls, value: Object.fromEntries([
      ['Collection', 'collection'], ['Workflow', 'workflow'], ['CollectionStaging', 'collection-staging'],
      ['FormDraftsRuntime', 'form-runtime'], ['FormDraftsUpgrade', 'form-drafts']
    ].flatMap(([name, kind]) => {
      const stem = name!.startsWith('Form') ? name! : `${name}Upgrade`
      const form = kind!.startsWith('form-')
      return [
        [`read${stem}Database`, async (scope: unknown) => ({ scope, accountId: 'a'.repeat(32), databaseId: '11111111-1111-4111-8111-111111111111', name: `ps-content-${'b'.repeat(32)}`,
          ...(kind !== 'collection' ? { collectionOperationId: 'collection_original' } : {}),
          ...(kind === 'collection-staging' || form ? { workflowOperationId: 'workflow_original' } : {}),
          ...(form ? { stagingOperationId: 'staging_original' } : {}),
          ...(kind === 'form-drafts' ? { runtime: { digest: 'd'.repeat(64), etag: 'verified-etag', successorIdentity: 'e'.repeat(64) } } : {}) })],
        [`execute${stem}`, async (input: unknown) => {
          const intent = input as CollectionUpgradeOperation & { runtime?: unknown }
          calls.push(intent)
          const { actor, version, policyVersion, runtime, ...physical } = intent
          return { status: 'installed', receipt: kind === 'form-runtime' ? { ...physical, runtimeKind: 'form-drafts-v1' } : physical }
        }],
        [`read${stem}Operation`, async () => null]
      ]
    })) }
  }

  const coordinate = async (input: unknown, claims: unknown, worker: ReturnType<typeof binding>) =>
    (await api()).coordinateCustomerSchemaUpgrade(input, claims, { runTransaction, binding: worker.value })

  it('returns retained form-runtime running status only after fresh native authority', async () => {
    const { claims } = await session(), worker = binding(), requestId = randomUUID()
    worker.value.executeFormDraftsRuntime = async (intent) => {
      worker.calls.push(intent as CollectionUpgradeOperation)
      return { status: 'running' }
    }
    await coordinate({ action: 'start', kind: 'form-runtime', requestId }, claims, worker)
    const intent = structuredClone(worker.calls[0])
    let statusReturned = false, finalTransactions = 0
    worker.value.readFormDraftsRuntimeOperation = async (request) => {
      expect(request).toEqual(intent)
      await db.query('SELECT 1')
      statusReturned = true
      return { state: 'running', leaseUntil: new Date(Date.now() + 60_000).toISOString(), receipt: null }
    }
    const observingRun: RunPageStudioTransaction = (callback) => {
      if (statusReturned) finalTransactions++
      return runTransaction(callback)
    }
    expect(await (await api()).coordinateCustomerSchemaUpgrade({ action: 'status', kind: 'form-runtime' }, claims,
      { runTransaction: observingRun, binding: worker.value })).toEqual({ kind: 'form-runtime', status: 'running', requestId, recoveryId: null, canConfigure: true })
    expect(finalTransactions).toBe(1)
    expect(worker.calls).toEqual([intent])
    expect((await db.query('SELECT metadata->\'intent\' AS intent FROM page_studio_audit_events WHERE action=\'content.form-runtime-upgrade.requested\'')).rows.map(row => row.intent)).toEqual([intent])
  })
  it.each(['child', 'parent', 'membership'])('withholds retained form-runtime running status after awaited %s revocation', async (reason) => {
    const { claims } = await session(), worker = binding(), requestId = randomUUID()
    worker.value.executeFormDraftsRuntime = async (intent) => {
      worker.calls.push(intent as CollectionUpgradeOperation)
      return { status: 'running' }
    }
    await coordinate({ action: 'start', kind: 'form-runtime', requestId }, claims, worker)
    const mutations: Record<string, string> = {
      child: 'UPDATE page_studio_customer_editor_sessions SET revoked_at=clock_timestamp()',
      parent: 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
      membership: 'UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()'
    }
    const readStatus = vi.fn(async () => {
      await db.query(mutations[reason]!)
      return { state: 'running', leaseUntil: null, receipt: null }
    })
    worker.value.readFormDraftsRuntimeOperation = readStatus
    await expect(coordinate({ action: 'status', kind: 'form-runtime' }, claims, worker)).rejects.toMatchObject({ statusCode: 403 })
    expect(readStatus).toHaveBeenCalledWith(worker.calls[0])
    expect(worker.calls).toHaveLength(1)
  })
  it('keeps retained form-runtime status strict and verifies its installed receipt', async () => {
    const { claims } = await session(), worker = binding()
    await coordinate({ action: 'start', kind: 'form-runtime', requestId: randomUUID() }, claims, worker)
    const contract = (await contracts()).find(value => value.kind === 'form-runtime')!
    const receipt = contract.expectedReceipt(worker.calls[0])
    for (const raw of [
      { state: 'uploading', leaseUntil: null, receipt: null },
      { state: 'running', leaseUntil: null, receipt: null, unexpected: true },
      { state: 'installed', leaseUntil: null, receipt: { ...receipt, runtimeKind: 'foreign' } }
    ]) {
      worker.value.readFormDraftsRuntimeOperation = async () => raw
      await expect(coordinate({ action: 'status', kind: 'form-runtime' }, claims, worker)).rejects.toThrow()
    }
    worker.value.readFormDraftsRuntimeOperation = async () => ({ state: 'installed', leaseUntil: null, receipt: { ...receipt, databaseId: randomUUID() } })
    await expect(coordinate({ action: 'status', kind: 'form-runtime' }, claims, worker)).rejects.toMatchObject({ statusCode: 503 })
    worker.value.readFormDraftsRuntimeOperation = async () => ({ state: 'installed', leaseUntil: null, receipt })
    expect(await coordinate({ action: 'status', kind: 'form-runtime' }, claims, worker)).toMatchObject({ status: 'installed' })
    expect(worker.calls).toHaveLength(1)
  })

  it.each(['collection', 'workflow', 'collection-staging', 'form-runtime', 'form-drafts'])('retains and executes a customer %s upgrade with exact private authority', async (kind) => {
    const { claims } = await session(), worker = binding(), requestId = randomUUID()
    expect(await coordinate({ action: 'status', kind }, claims, worker)).toMatchObject({ status: 'pending', recoveryId: null })
    expect(worker.calls).toHaveLength(0)
    const result = await coordinate({ action: 'start', kind, requestId }, claims, worker)
    expect(result).toEqual({ kind, status: 'installed', requestId, recoveryId: null, canConfigure: true })
    const contract = (await contracts()).find(value => value.kind === kind)!
    const intent = worker.calls[0]
    expect(intent.actor).toEqual({ kind: 'customer-user', userId: ids.owner, loginSessionHash: hash(token) })
    const { createSchemaUpgradeAuthority } = await import('~~/server/utils/pageStudio/schemaUpgradeAuthority')
    expect(await createSchemaUpgradeAuthority(contract).authorize(intent, 'staging', { runTransaction })).toEqual(intent)
    expect(await coordinate({ action: 'start', kind, requestId }, claims, worker)).toEqual(result)
    expect(worker.calls[1]).toEqual(intent)
    expect((await db.query('SELECT COUNT(*) FROM page_studio_audit_events WHERE action=$1', [`content.${kind}-upgrade.requested`])).rows[0].count).toBe('1')
  })
  it('serializes duplicate starts and rejects changed requests without replacing the intent', async () => {
    const { claims } = await session(), worker = binding(), requestId = randomUUID()
    await Promise.all([coordinate({ action: 'start', kind: 'collection', requestId }, claims, worker), coordinate({ action: 'start', kind: 'collection', requestId }, claims, worker)])
    expect(worker.calls[0]).toEqual(worker.calls[1])
    await expect(coordinate({ action: 'start', kind: 'collection', requestId: randomUUID() }, claims, worker)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('requires explicit CAS recovery for a new child and never rewinds later recovery', async () => {
    const first = await session(), worker = binding(), requestId = randomUUID(), kind = 'collection'
    await coordinate({ action: 'start', kind, requestId }, first.claims, worker)
    const original = structuredClone(worker.calls[0]), second = await session(), third = await session()
    await db.query('UPDATE page_studio_customer_editor_sessions SET revoked_at=clock_timestamp() WHERE nonce=$1', [first.claims.nonce])
    expect(await coordinate({ action: 'status', kind }, second.claims, worker)).toMatchObject({ status: 'reconciliation', canConfigure: false })
    await expect(coordinate({ action: 'start', kind, requestId }, second.claims, worker)).rejects.toMatchObject({ statusCode: 409 })
    const recoveryId = randomUUID()
    expect(await coordinate({ action: 'recover', kind, requestId: recoveryId, expectedRecoveryId: null }, second.claims, worker)).toMatchObject({ recoveryId, status: 'installed' })
    expect(worker.calls.at(-1)).toEqual(original)
    await coordinate({ action: 'recover', kind, requestId: randomUUID(), expectedRecoveryId: recoveryId }, third.claims, worker)
    await expect(coordinate({ action: 'recover', kind, requestId: recoveryId, expectedRecoveryId: null }, second.claims, worker)).rejects.toMatchObject({ statusCode: 409 })
    const contract = (await contracts()).find(value => value.kind === 'collection')!
    await expect((await api()).authorizeCustomerSchemaUpgrade(contract, original, 'production', { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    await db.query('UPDATE page_studio_customer_editor_sessions SET revoked_at=clock_timestamp() WHERE nonce=$1', [third.claims.nonce])
    await expect((await api()).authorizeCustomerSchemaUpgrade(contract, original, 'staging', { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['collection', 'form-runtime', 'form-drafts'].flatMap(kind => ['child', 'parent', 'membership', 'entitlement', 'approver', 'account'].map(reason => [kind, reason])))('denies retained %s callbacks after %s revocation', async (kind, reason) => {
    const { claims } = await session(), worker = binding(), requestId = randomUUID()
    await coordinate({ action: 'start', kind, requestId }, claims, worker)
    const mutations: Record<string, string> = {
      child: 'UPDATE page_studio_customer_editor_sessions SET revoked_at=clock_timestamp()',
      parent: 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
      membership: 'UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()',
      entitlement: 'UPDATE page_studio_entitlements SET status=\'suspended\'',
      approver: 'UPDATE team_members SET is_active=FALSE',
      account: 'UPDATE page_studio_customer_accounts SET status=\'suspended\''
    }
    await db.query(mutations[reason]!)
    const contract = (await contracts()).find(value => value.kind === kind)!
    await expect((await api()).authorizeCustomerSchemaUpgrade(contract, worker.calls[0], 'staging', { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    await expect(coordinate({ action: 'start', kind, requestId }, claims, worker)).rejects.toMatchObject({ statusCode: 403 })
    expect(worker.calls).toHaveLength(1)
  })
  it('rejects caller-selected scope and foreign signed claims before discovery', async () => {
    const { claims } = await session(), worker = binding()
    await expect(coordinate({ action: 'start', kind: 'collection', requestId: randomUUID(), siteId: claims.siteId }, claims, worker)).rejects.toMatchObject({ statusCode: 400 })
    await expect(coordinate({ action: 'status', kind: 'collection' }, { ...claims, siteId: randomUUID() }, worker)).rejects.toMatchObject({ statusCode: 403 })
    expect(worker.calls).toHaveLength(0)
  })
  it('rechecks native authority after discovery without retaining an intent', async () => {
    const { claims } = await session(), worker = binding(), discover = worker.value.readCollectionUpgradeDatabase!
    worker.value.readCollectionUpgradeDatabase = async (scope) => {
      const result = await discover(scope)
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
      return result
    }
    await expect(coordinate({ action: 'start', kind: 'collection', requestId: randomUUID() }, claims, worker)).rejects.toMatchObject({ statusCode: 403 })
    expect(worker.calls).toHaveLength(0)
    expect((await db.query('SELECT COUNT(*) FROM page_studio_audit_events WHERE action=\'content.collection-upgrade.requested\'')).rows[0].count).toBe('0')
  })
  it('rejects a foreign discovered database scope', async () => {
    const { claims } = await session(), worker = binding(), discover = worker.value.readCollectionUpgradeDatabase!
    worker.value.readCollectionUpgradeDatabase = async scope => ({ ...await discover(scope), scope: { ...scope as object, siteId: randomUUID() } })
    await expect(coordinate({ action: 'start', kind: 'collection', requestId: randomUUID() }, claims, worker)).rejects.toMatchObject({ statusCode: 403 })
    expect(worker.calls).toHaveLength(0)
  })
  it('verifies exact installed receipts and rechecks logout after worker execution', async () => {
    const { claims } = await session(), worker = binding(), execute = worker.value.executeCollectionUpgrade!
    worker.value.executeCollectionUpgrade = async (intent) => {
      const result = await execute(intent) as { status: string, receipt: Record<string, unknown> }
      return { ...result, receipt: { ...result.receipt, databaseId: randomUUID() } }
    }
    const input = { action: 'start', kind: 'collection', requestId: randomUUID() }
    await expect(coordinate(input, claims, worker)).rejects.toMatchObject({ statusCode: 503 })
    worker.value.executeCollectionUpgrade = async (intent) => {
      const result = await execute(intent)
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
      return result
    }
    await expect(coordinate(input, claims, worker)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('cannot recover or dispatch a disabled operation', async () => {
    const { claims } = await session(), worker = binding(), requestId = randomUUID()
    await coordinate({ action: 'start', kind: 'collection', requestId }, claims, worker)
    const intent = worker.calls[0]
    await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id)
      VALUES($1,$2,$3,$4,'customer','content.collection-upgrade.disabled','collection_upgrade',$5)`, [claims.tenantId, claims.clientId, claims.siteId, claims.userId, intent.operationId])
    for (const input of [{ action: 'start', kind: 'collection', requestId }, { action: 'recover', kind: 'collection', requestId: randomUUID(), expectedRecoveryId: null }]) {
      await expect(coordinate(input, claims, worker)).rejects.toMatchObject({ statusCode: 403 })
    }
    const contract = (await contracts()).find(value => value.kind === 'collection')!
    await expect((await api()).authorizeCustomerSchemaUpgrade(contract, intent, 'staging', { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect(worker.calls).toHaveLength(1)
  })
  it('serializes competing recoveries and rolls back failed recovery audit writes', async () => {
    const first = await session(), second = await session(), third = await session(), worker = binding(), kind = 'collection'
    await coordinate({ action: 'start', kind, requestId: randomUUID() }, first.claims, worker)
    await db.query(`CREATE FUNCTION reject_customer_upgrade_recovery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
      CREATE TRIGGER reject_customer_upgrade_recovery BEFORE INSERT ON page_studio_audit_events FOR EACH ROW WHEN (NEW.action='customer.collection-upgrade.recovered') EXECUTE FUNCTION reject_customer_upgrade_recovery()`)
    await expect(coordinate({ action: 'recover', kind, requestId: randomUUID(), expectedRecoveryId: null }, second.claims, worker)).rejects.toThrow('audit unavailable')
    await db.query('DROP TRIGGER reject_customer_upgrade_recovery ON page_studio_audit_events; DROP FUNCTION reject_customer_upgrade_recovery()')
    expect(await coordinate({ action: 'status', kind }, first.claims, worker)).toMatchObject({ recoveryId: null })
    const results = await Promise.allSettled([second, third].map(value => coordinate({ action: 'recover', kind, requestId: randomUUID(), expectedRecoveryId: null }, value.claims, worker)))
    expect(results.filter(value => value.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(value => value.status === 'rejected')).toHaveLength(1)
  })

  it('rechecks membership expiry after trailing retained-intent reads in worker admission', async () => {
    const { claims } = await session(), worker = binding()
    await coordinate({ action: 'start', kind: 'collection', requestId: randomUUID() }, claims, worker)
    let retainedReads = 0
    const delayedRun: RunPageStudioTransaction = callback => runTransaction(async client => callback({ query: async (sql: string, params: unknown[]) => {
      const rows = await client.query(sql, params)
      if (sql.includes('AND action=$4 AND resource_type=$5') && ++retainedReads === 2) {
        // The authority already holds this membership row; narrow its deadline and
        // cross it during the trailing read, without relying on runner speed.
        await client.query('UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()+INTERVAL \'50 milliseconds\' WHERE workspace_id=$1', [claims.workspaceId])
        await client.query('SELECT pg_sleep(0.1)')
      }
      return rows
    } }))
    const contract = (await contracts()).find(value => value.kind === 'collection')!
    await expect((await api()).authorizeCustomerSchemaUpgrade(contract, worker.calls[0], 'staging', { runTransaction: delayedRun })).rejects.toMatchObject({ statusCode: 403 })
    expect(retainedReads).toBe(2)
  })

  it('recovers after native logout without rewriting original login provenance', async () => {
    const first = await session(), worker = binding(), kind = 'collection'
    await coordinate({ action: 'start', kind, requestId: randomUUID() }, first.claims, worker)
    const original = structuredClone(worker.calls[0]), nextToken = 'b'.repeat(64)
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
    await db.query('INSERT INTO page_studio_customer_sessions(token_hash,account_id,expires_at) SELECT $1,id,clock_timestamp()+INTERVAL \'1 day\' FROM page_studio_customer_accounts WHERE identity_id=$2', [hash(nextToken), ids.owner])
    const next = await session(nextToken)
    await coordinate({ action: 'recover', kind, requestId: randomUUID(), expectedRecoveryId: null }, next.claims, worker)
    expect(worker.calls.at(-1)).toEqual(original)
    const contract = (await contracts()).find(value => value.kind === kind)!
    expect(await (await api()).authorizeCustomerSchemaUpgrade(contract, original, 'staging', { runTransaction })).toEqual(original)
    await expect(coordinate({ action: 'status', kind }, first.claims, worker)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('denies recovery takeover by a newly authorized different workspace owner', async () => {
    const first = await session(), worker = binding(), kind = 'collection'
    await coordinate({ action: 'start', kind, requestId: randomUUID() }, first.claims, worker)
    const otherAccount = randomUUID(), otherToken = 'c'.repeat(64)
    await db.query('UPDATE page_studio_customer_identities SET subject=$1 WHERE id=$2', [otherAccount, ids.other])
    await db.query('INSERT INTO page_studio_customer_accounts(id,email,name,identity_id,status,terms_version) VALUES($1,\'other@example.test\',\'Other\',$2,\'active\',\'v1\')', [otherAccount, ids.other])
    await db.query('INSERT INTO page_studio_customer_sessions(token_hash,account_id,expires_at) VALUES($1,$2,clock_timestamp()+INTERVAL \'1 day\')', [hash(otherToken), otherAccount])
    await db.query('UPDATE page_studio_workspace_memberships SET identity_id=$1 WHERE workspace_id=$2', [ids.other, first.claims.workspaceId])
    await db.query('UPDATE page_studio_customer_setup_drafts SET identity_id=$1 WHERE identity_id=$2', [ids.other, ids.owner])
    const next = await session(otherToken)
    await expect(coordinate({ action: 'recover', kind, requestId: randomUUID(), expectedRecoveryId: null }, next.claims, worker)).rejects.toMatchObject({ statusCode: 403 })
    expect(worker.calls).toHaveLength(1)
    expect((await db.query('SELECT COUNT(*) FROM page_studio_audit_events WHERE action=\'customer.collection-upgrade.recovered\'')).rows[0].count).toBe('0')
  })
  it('keeps native agency and portal preparation closed to customer actors', async () => {
    const { claims } = await session()
    const contract = (await contracts()).find(value => value.kind === 'collection')!
    const { createSchemaUpgradePreparation } = await import('~~/server/utils/pageStudio/schemaUpgradeIntent')
    const transactionAttempt = vi.fn(), discoveryAttempt = vi.fn(), recheck = vi.fn()
    const prepare = createSchemaUpgradePreparation(contract, recheck)
    await expect(prepare({ actor: { role: 'customer', actorId: claims.userId, clientId: claims.clientId } as never,
      event: {} as never, siteId: claims.siteId, environment: 'staging', body: { requestId: randomUUID() } },
    { runTransaction: transactionAttempt, resolveDatabase: discoveryAttempt })).rejects.toMatchObject({ statusCode: 403 })
    expect(transactionAttempt).not.toHaveBeenCalled()
    expect(discoveryAttempt).not.toHaveBeenCalled()
    expect(recheck).not.toHaveBeenCalled()
  })
  it('keeps runtime and form storage recovery and withdrawal independently retained', async () => {
    const first = await session(), second = await session(), worker = binding()
    for (const kind of ['form-runtime', 'form-drafts']) await coordinate({ action: 'start', kind, requestId: randomUUID() }, first.claims, worker)
    const [runtimeIntent, formIntent] = structuredClone(worker.calls)
    const list = await contracts(), runtime = list.find(value => value.kind === 'form-runtime')!, forms = list.find(value => value.kind === 'form-drafts')!
    await db.query('UPDATE page_studio_customer_editor_sessions SET revoked_at=clock_timestamp() WHERE nonce=$1', [first.claims.nonce])
    const runtimeRecovery = randomUUID()
    await coordinate({ action: 'recover', kind: 'form-runtime', requestId: runtimeRecovery, expectedRecoveryId: null }, second.claims, worker)
    expect(worker.calls.at(-1)).toEqual(runtimeIntent)
    expect(await coordinate({ action: 'status', kind: 'form-drafts' }, second.claims, worker)).toMatchObject({ status: 'reconciliation', recoveryId: null })
    await expect((await api()).authorizeCustomerSchemaUpgrade(forms, formIntent, 'staging', { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    const formRecovery = randomUUID()
    await coordinate({ action: 'recover', kind: 'form-drafts', requestId: formRecovery, expectedRecoveryId: null }, second.claims, worker)
    expect(worker.calls.at(-1)).toEqual(formIntent)
    expect(await coordinate({ action: 'status', kind: 'form-runtime' }, second.claims, worker)).toMatchObject({ recoveryId: runtimeRecovery })
    expect(await coordinate({ action: 'status', kind: 'form-drafts' }, second.claims, worker)).toMatchObject({ recoveryId: formRecovery })
    await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id)
      VALUES($1,$2,$3,$4,'customer','content.form-drafts-upgrade.disabled','form-drafts_upgrade',$5)`, [first.claims.tenantId, first.claims.clientId, first.claims.siteId, first.claims.userId, formIntent!.operationId])
    await expect((await api()).authorizeCustomerSchemaUpgrade(forms, formIntent, 'staging', { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect(await (await api()).authorizeCustomerSchemaUpgrade(runtime, runtimeIntent, 'staging', { runTransaction })).toEqual(runtimeIntent)
    const rows = (await db.query('SELECT metadata->\'intent\' AS intent FROM page_studio_audit_events WHERE action IN (\'content.form-runtime-upgrade.requested\',\'content.form-drafts-upgrade.requested\') ORDER BY recorded_at')).rows
    expect(rows.map(row => row.intent)).toEqual([runtimeIntent, formIntent])
  })
  it.each(['form-runtime', 'form-drafts'])('rejects cross-kind receipts and stale logout for %s', async (kind) => {
    const { claims } = await session(), worker = binding(), stem = kind === 'form-runtime' ? 'FormDraftsRuntime' : 'FormDraftsUpgrade'
    const execute = worker.value[`execute${stem}`]!, request = { action: 'start', kind, requestId: randomUUID() }
    worker.value[`execute${stem}`] = async (input) => {
      const result = await execute(input) as { status: string, receipt: Record<string, unknown> }
      if (kind === 'form-runtime') delete result.receipt.runtimeKind
      else result.receipt.runtimeKind = 'form-drafts-v1'
      return result
    }
    await expect(coordinate(request, claims, worker)).rejects.toThrow()
    worker.value[`execute${stem}`] = async (input) => {
      const result = await execute(input)
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
      return result
    }
    await expect(coordinate(request, claims, worker)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('retains and checks server-discovered runtime pins without accepting substitutions', async () => {
    const { claims } = await session(), worker = binding(), request = { action: 'start', kind: 'form-drafts', requestId: randomUUID() }
    const discover = worker.value.readFormDraftsUpgradeDatabase!
    worker.value.readFormDraftsUpgradeDatabase = async (scope) => {
      const { runtime, ...missing } = await discover(scope) as Record<string, unknown>
      return missing
    }
    await expect(coordinate(request, claims, worker)).rejects.toThrow()
    expect(worker.calls).toHaveLength(0)
    worker.value.readFormDraftsUpgradeDatabase = discover
    await coordinate(request, claims, worker)
    const contract = (await contracts()).find(value => value.kind === 'form-drafts')!, intent = worker.calls[0] as CollectionUpgradeOperation & { runtime: Record<string, string> }
    for (const field of ['digest', 'etag', 'successorIdentity']) await expect((await api()).authorizeCustomerSchemaUpgrade(contract, { ...intent, runtime: { ...intent.runtime, [field]: field === 'etag' ? 'forged' : 'f'.repeat(64) } }, 'staging', { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect(await (await api()).authorizeCustomerSchemaUpgrade(contract, intent, 'staging', { runTransaction })).toEqual(intent)
  })
  it.each(['form-runtime', 'form-drafts'])('rejects worker-only %s evidence without a retained native grant', async (kind) => {
    const { claims } = await session(), worker = binding()
    const contract = (await contracts()).find(value => value.kind === kind)!
    const scope = { tenantId: claims.tenantId, clientId: claims.clientId, businessId: claims.clientId, siteId: claims.siteId, environment: claims.environment }
    const intent = contract.schema.parse({ ...await worker.value[contract.discoveryMethod]!(scope) as object,
      operationId: randomUUID(), version: 1, policyVersion: contract.schema.shape.policyVersion.value,
      sourceDigest: contract.schema.shape.sourceDigest.value, targetDigest: contract.schema.shape.targetDigest.value,
      actor: { kind: 'customer-user', userId: claims.userId, loginSessionHash: hash(token) } })
    expect(await worker.value[contract.executeMethod]!(intent)).toMatchObject({ status: 'installed' })
    await expect((await api()).authorizeCustomerSchemaUpgrade(contract, intent, 'staging', { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
  })
})
