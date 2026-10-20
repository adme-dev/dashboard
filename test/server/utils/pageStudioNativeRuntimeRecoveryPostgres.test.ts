import type { z } from 'zod'
import type { ContentRuntimeRecoveryReviewSchema } from '../../../workers/page-studio-management/src/nativeRuntimeRecoveryContract'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import type { CollectionUpgradeOperation } from '~~/shared/pageStudio/collection-upgrade'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: native.transaction, transactionWithoutRetry: native.transaction }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const ownershipMigration = '444_page_studio_customer_site_ownership.sql'
const ids = { owner: randomUUID(), other: randomUUID(), client: randomUUID(), staff: randomUUID() }

describe.runIf(Boolean(databaseUrl)).each(['editor', 'cms-setup'])('native customer CMS prerequisites on PostgreSQL (%s)', (purpose) => {
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
      CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL, user_role TEXT DEFAULT 'owner', custom_role_id UUID, sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT, is_system BOOLEAN DEFAULT FALSE);
      CREATE TABLE page_studio_sessions(nonce TEXT,role TEXT,revoked_at TIMESTAMPTZ);
      CREATE TABLE role_permission_groups (role_id UUID, permission_group TEXT, UNIQUE (role_id, permission_group));
    `)
    await db.query(migration('402_page_studio_control_plane.sql'))
    await db.query(migration('420_page_studio_login_sessions.sql'))
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
    await db.query(migration('404_page_studio_documents.sql'))
    await db.query(migration('422_page_studio_cms_visibility.sql'))
    await db.query(migration('425_page_studio_cms_authoring_scope.sql'))
    workspaces = await import('~~/server/utils/pageStudio/customerWorkspaces')
  })
  beforeEach(async () => {
    await db.query('DROP FUNCTION IF EXISTS fail_customer_pointer() CASCADE')
    await db.query('DROP FUNCTION IF EXISTS fail_customer_activation() CASCADE')
    await db.query(`TRUNCATE agency_clients, team_members, page_studio_customer_identities, page_studio_login_sessions CASCADE`)
    await db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [ids.client])
    await db.query('INSERT INTO team_members(id,is_active) VALUES ($1, TRUE)', [ids.staff])
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
    if (purpose === 'cms-setup') {
      await db.query(`INSERT INTO page_studio_customer_cms_setup_approvals
        (workspace_id,site_id,identity_id,tenant_id,business_id,approved_by,preview_policy,expires_at)
        SELECT workspace_id,site_id,$1,tenant_id,business_id,(preview_policy->>'approvedBy')::uuid,preview_policy,(preview_policy->>'expiresAt')::timestamptz
        FROM page_studio_customer_site_requests ON CONFLICT(site_id) DO NOTHING`, [ids.owner])
      return api.issueCustomerCmsSetupHandoff(sessionToken, config, { runTransaction })
    }
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

  const operatorHash = '9'.repeat(64)
  const recoveryApi = () => import('~~/workers/page-studio-management/src/nativeRuntimeRecovery')
  async function recoveryFixture() {
    await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('agency',$1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day')`, [operatorHash, ids.staff])
    const current = await session(), worker = binding(), requestId = randomUUID()
    await coordinate({ action: 'start', kind: 'collection', requestId }, current.claims, worker)
    const intent = worker.calls[0]!, canonical = (await import('~~/shared/pageStudio/collectionApi')).collectionCanonical
    const owner = { accountId: intent.accountId, databaseId: intent.databaseId, namespace: 'xeroflow-page-studio-dispatch-staging',
      compatibilityDate: '2026-08-18', runtimeDigest: 'd'.repeat(64), setupDigest: 'e'.repeat(64), scope: intent.scope,
      scriptName: `ps-content-${'1'.repeat(32)}`, ownerTag: `ps-owner-${'2'.repeat(32)}` }
    const original = { scope_key: canonical(intent.scope), identity: '3'.repeat(64), request: canonical(intent), policy: '{}', base_snapshot: '{}', intent: canonical(owner),
      state: 'uploading', etag: null, claim_token: null, claimed_until: null, created_at: new Date().toISOString() }
    let selected: { review: z.infer<typeof ContentRuntimeRecoveryReviewSchema>, state: string } | null = null
    const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: {
      observeContentRuntimeRecovery: vi.fn(async () => ({ original, replacement: selected ? canonical(selected.review) : null, observedAt: new Date().toISOString() })),
      createPendingContentRuntimeReplacement: vi.fn(async (review: z.infer<typeof ContentRuntimeRecoveryReviewSchema>) => {
        const callback = { expectedControlPlaneEnvironment: 'production', phase: 'create', reviewId: review.reviewId, attemptId: review.attemptId, reviewDigest: hash(canonical(review)) }
        await (await recoveryApi()).authorizeNativeRuntimeRecovery(callback, env, runTransaction)
        if (selected && canonical(selected.review) !== canonical(review)) throw new Error('Competing recovery')
        selected ??= { review, state: 'pending' }
        return { reviewId: review.reviewId, attemptId: review.attemptId, state: selected.state }
      }),
      approvePendingContentRuntimeReplacement: vi.fn(async (review: z.infer<typeof ContentRuntimeRecoveryReviewSchema>) => {
        const callback = { expectedControlPlaneEnvironment: 'production', phase: 'approve', reviewId: review.reviewId, attemptId: review.attemptId, reviewDigest: hash(canonical(review)) }
        const result = await (await recoveryApi()).authorizeNativeRuntimeRecovery(callback, env, runTransaction)
        if (!result.approval || !selected || canonical(selected.review) !== canonical(review)) throw new Error('Missing applied review')
        selected.state = 'reserved'
        return { reviewId: review.reviewId, attemptId: review.attemptId, state: selected.state }
      })
    } }
    const input = { expectedControlPlaneEnvironment: 'production' as const, siteId: intent.scope.siteId, requestId, operator: { actorId: ids.staff, loginSessionHash: operatorHash } }
    const call = (action: string, reviewId?: string) => recoveryApi().then(api => api.handleNativeRuntimeRecoveryOperator({ ...input, action, ...(reviewId ? { reviewId } : {}) }, env, runTransaction))
    return { current, input, intent, env, call, selected: () => selected }
  }
  it('retains one exact prepared review and gates pending on an immutable applied receipt plus a separate explicit admission', async () => {
    const f = await recoveryFixture()
    const prepared = await f.call('prepare')
    expect(prepared.phase).toBe('prepared')
    expect(await f.call('prepare')).toEqual(prepared)
    expect(f.selected()).toBeNull()
    const applied = await f.call('apply', prepared.reviewId)
    expect(applied.phase).toBe('approval-retained')
    expect(f.selected()!.state).toBe('pending')
    expect(f.env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER.approvePendingContentRuntimeReplacement).not.toHaveBeenCalled()
    expect(await f.call('apply', prepared.reviewId)).toMatchObject({ reviewId: prepared.reviewId, phase: 'admitted' })
    expect(f.selected()!.state).toBe('reserved')
    expect((await db.query('SELECT metadata FROM page_studio_audit_events WHERE action=\'content.collection-upgrade.requested\'')).rows[0].metadata.intent).toEqual(f.intent)
    await expect(db.query('UPDATE page_studio_audit_events SET metadata=\'{}\' WHERE action=\'customer.runtime-recovery.applied\'')).rejects.toThrow()
  })
  it.each([
    ['role', 'UPDATE team_members SET user_role=\'member\''],
    ['operator-revoked', 'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'],
    ['operator-expired', 'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval \'1 second\''],
    ['child-revoked', 'UPDATE page_studio_customer_editor_sessions SET revoked_at=clock_timestamp()'],
    ['owner-expired', 'UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()-interval \'1 second\'']
  ])('denies %s after preparation before any D1 recovery effect', async (_name, sql) => {
    const f = await recoveryFixture(), prepared = await f.call('prepare')
    await db.query(sql)
    await expect(f.call('apply', prepared.reviewId)).rejects.toThrow()
    expect(f.env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER.createPendingContentRuntimeReplacement).not.toHaveBeenCalled()
    expect(f.selected()).toBeNull()
  })
  it('foreign operator session cannot inherit a prepared review', async () => {
    const f = await recoveryFixture(), prepared = await f.call('prepare')
    await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      SELECT role,$1,user_id,issued_at,expires_at FROM page_studio_login_sessions`, ['8'.repeat(64)])
    await expect((await recoveryApi()).handleNativeRuntimeRecoveryOperator({ ...f.input, action: 'apply', reviewId: prepared.reviewId,
      operator: { ...f.input.operator, loginSessionHash: '8'.repeat(64) } }, f.env, runTransaction)).rejects.toThrow()
    expect(f.selected()).toBeNull()
  })
  it.each([
    ['operator', 'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'],
    ['child', 'UPDATE page_studio_customer_editor_sessions SET revoked_at=clock_timestamp()'],
    ['expiry', 'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval \'1 second\'']
  ])('a changed %s after pending creation withholds the applied receipt', async (_name, sql) => {
    const f = await recoveryFixture(), prepared = await f.call('prepare')
    const create = f.env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER.createPendingContentRuntimeReplacement
    const original = create.getMockImplementation()!
    create.mockImplementationOnce(async (review) => {
      const result = await original(review)
      await db.query(sql)
      return result
    })
    await expect(f.call('apply', prepared.reviewId)).rejects.toThrow()
    expect(f.selected()!.state).toBe('pending')
    expect((await db.query('SELECT id FROM page_studio_audit_events WHERE action=\'customer.runtime-recovery.applied\'')).rows).toHaveLength(0)
    expect(f.env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER.approvePendingContentRuntimeReplacement).not.toHaveBeenCalled()
  })
  it('ordinary child recovery changes the pinned head and invalidates an older operator review', async () => {
    const f = await recoveryFixture(), prepared = await f.call('prepare'), fresh = await session()
    await coordinate({ action: 'recover', kind: 'collection', requestId: randomUUID(), expectedRecoveryId: null }, fresh.claims, binding())
    await expect(f.call('apply', prepared.reviewId)).rejects.toThrow()
    expect(f.selected()).toBeNull()
    const replacementReview = await f.call('prepare')
    expect(replacementReview.reviewId).not.toBe(prepared.reviewId)
  })
  it('a prepared review alone is never an approve/advance receipt', async () => {
    const f = await recoveryFixture(), prepared = await f.call('prepare')
    const review = (await db.query('SELECT metadata->\'review\' AS review FROM page_studio_audit_events WHERE action=\'customer.runtime-recovery.prepared\'')).rows[0].review
    for (const phase of ['approve', 'advance']) await expect((await recoveryApi()).authorizeNativeRuntimeRecovery({ expectedControlPlaneEnvironment: 'production', phase,
      reviewId: prepared.reviewId, attemptId: review.attemptId, reviewDigest: prepared.reviewDigest }, f.env, runTransaction)).rejects.toThrow()
    expect(f.selected()).toBeNull()
  })
})
