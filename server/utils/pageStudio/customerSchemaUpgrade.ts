import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { CustomerSchemaUpgradeRequestSchema, CustomerSchemaUpgradeStatusSchema } from '~~/shared/pageStudio/customerSchemaUpgrade'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { CustomerEditorClaimsSchema, type CustomerEditorClaims } from './customerEditorToken'
import { assertCustomerEditorSessionAuthority } from './customerEditorSessions'
import { formDraftsRuntimeContract, formDraftsUpgradeContract, collectionUpgradeContract, workflowUpgradeContract, collectionStagingUpgradeContract, type SchemaUpgradeContract } from './schemaUpgradeContract'
import { requirePageStudioProvisioningRuntime } from './provisioningBinding'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

const contracts = { 'form-runtime': formDraftsRuntimeContract, 'form-drafts': formDraftsUpgradeContract, 'collection': collectionUpgradeContract, 'workflow': workflowUpgradeContract, 'collection-staging': collectionStagingUpgradeContract }
type Binding = Record<string, (input: unknown) => Promise<unknown>>
type Dependencies = { runTransaction?: RunPageStudioTransaction, binding?: Binding, env?: Record<string, unknown> }
const denied = () => createError({ statusCode: 403, statusMessage: 'Customer CMS setup is not available.' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Refresh CMS setup before continuing.' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Customer CMS setup is pending.' })
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
const scopeOf = (claims: CustomerEditorClaims) => ({ tenantId: claims.tenantId, clientId: claims.clientId, businessId: claims.clientId, siteId: claims.siteId, environment: claims.environment })
const Recovery = z.object({ revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), recoveryId: z.string().uuid(), expectedRecoveryId: z.string().uuid().nullable(), identity: z.string().regex(/^[a-f0-9]{64}$/), claims: CustomerEditorClaimsSchema }).strict()
interface Saved { metadata: { intent: unknown, identity: string, claims: CustomerEditorClaims, requestId: string }, actor_id: string, actor_role: string }

async function retained(db: PageStudioQueryClient, contract: SchemaUpgradeContract, scope: Omit<ReturnType<typeof scopeOf>, 'environment'> & { environment: string }) {
  if (scope.environment !== 'staging') throw denied()
  const rows = (await db.query<Saved>(`SELECT metadata,actor_id,actor_role FROM page_studio_audit_events
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND action=$4 AND resource_type=$5
      AND metadata->'intent'->'scope'->>'environment'=$6`,
  [scope.tenantId, scope.clientId, scope.siteId, `content.${contract.kind}-upgrade.requested`, `${contract.kind}_upgrade`, scope.environment])).rows
  if (rows.length > 1) throw denied()
  const row = rows[0]
  if (!row) return null
  const metadata = z.object({ intent: contract.schema, identity: z.string().regex(/^[a-f0-9]{64}$/), claims: CustomerEditorClaimsSchema, requestId: z.string().uuid() }).strict().parse(row.metadata)
  if (!same(metadata.intent.scope, scope) || metadata.intent.actor.kind !== 'customer-user' || metadata.intent.actor.userId !== row.actor_id
    || row.actor_role !== 'customer' || metadata.claims.userId !== row.actor_id || !same(scopeOf(metadata.claims), scope)
    || metadata.identity !== await contract.identity(metadata.intent)) throw denied()
  if ((await db.query(`SELECT id FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3
    AND resource_id=$4 AND resource_type=$5 AND action=$6`, [scope.tenantId, scope.clientId, scope.siteId, metadata.intent.operationId, `${contract.kind}_upgrade`, `content.${contract.kind}-upgrade.disabled`])).rows.length) throw denied()
  return metadata
}
type Retained = NonNullable<Awaited<ReturnType<typeof retained>>>
async function recovery(db: PageStudioQueryClient, contract: SchemaUpgradeContract, saved: Retained) {
  const { scope, operationId } = saved.intent
  const row = (await db.query<{ metadata: unknown, actor_id: string, actor_role: string }>(`SELECT metadata,actor_id,actor_role FROM page_studio_audit_events
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND resource_id=$4 AND resource_type=$5 AND action=$6
    ORDER BY (metadata->>'revision')::bigint DESC LIMIT 1`,
  [scope.tenantId, scope.clientId, scope.siteId, operationId, `${contract.kind}_upgrade`, `customer.${contract.kind}-upgrade.recovered`])).rows[0]
  if (!row) return null
  const value = Recovery.parse(row.metadata)
  if (value.identity !== saved.identity || row.actor_id !== saved.intent.actor.userId || row.actor_role !== 'customer'
    || value.claims.userId !== row.actor_id || !same(scopeOf(value.claims), scope)) throw denied()
  return value
}
async function admission(db: PageStudioQueryClient, contract: SchemaUpgradeContract, saved: Retained) {
  const head = await recovery(db, contract, saved)
  await assertCustomerEditorSessionAuthority(head?.claims ?? saved.claims, 'workspace:create', db)
  // Authority may have waited for site locks while another recovery committed.
  if (!same(await recovery(db, contract, saved), head)) throw conflict()
  const current = await retained(db, contract, saved.intent.scope)
  if (!current || !same(current, saved)) throw denied()
  await assertCustomerEditorSessionAuthority(head?.claims ?? saved.claims, 'workspace:create', db)
  return head
}

/** Private worker callback. Exact retained intent plus fresh original/recovered native child authority. */
export async function authorizeCustomerSchemaUpgrade(contract: SchemaUpgradeContract, input: unknown, environment: string, dependencies: Pick<Dependencies, 'runTransaction'> = {}) {
  const parsed = contract.schema.safeParse(input)
  if (!parsed.success || parsed.data.actor.kind !== 'customer-user' || environment !== 'staging' || parsed.data.scope.environment !== 'staging') throw denied()
  const request = parsed.data
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const saved = await retained(db, contract, request.scope)
    if (!saved || !same(saved.intent, request)) throw denied()
    await admission(db, contract, saved)
    return request
  })
}

/** No scope, actor, database or SQL is accepted from the caller. */
export async function coordinateCustomerSchemaUpgrade(input: unknown, tokenClaims: unknown, dependencies: Dependencies = {}) {
  const parsed = CustomerSchemaUpgradeRequestSchema.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400 })
  const request = parsed.data, claims = CustomerEditorClaimsSchema.parse(tokenClaims), contract = contracts[request.kind]
  const run = dependencies.runTransaction ?? transaction, scope = scopeOf(claims)
  const authorize = (db: PageStudioQueryClient) => assertCustomerEditorSessionAuthority(claims, 'workspace:create', db)
  const initial = await run(async (db) => {
    await authorize(db)
    const saved = await retained(db, contract, scope)
    if (saved && saved.intent.actor.userId !== claims.userId) throw denied()
    return saved
  })
  const result = (status: string, saved: Retained | null, recoveryId: string | null = null) => CustomerSchemaUpgradeStatusSchema.parse({ kind: request.kind, status, ...(saved ? { requestId: saved.requestId } : {}), recoveryId, canConfigure: !['disabled', 'reconciliation'].includes(status) })
  if (!initial && request.action === 'status') return result('pending', null)
  if (!initial && request.action === 'recover') throw conflict()
  const binding = dependencies.binding ?? (() => {
    const runtime = requirePageStudioProvisioningRuntime(dependencies.env)
    if (runtime.environment !== 'staging') throw denied()
    return runtime.binding as unknown as Binding
  })()
  const invoke = async (method: string, value: unknown) => {
    try {
      return await binding[method]!(structuredClone(value))
    } catch {
      throw unavailable()
    }
  }
  let discovered: unknown
  if (!initial && request.action === 'start') discovered = contract.databaseSchema.parse(await invoke(contract.discoveryMethod, scope))
  const prepared = await run(async (db) => {
    const authority = await authorize(db)
    let saved = await retained(db, contract, scope)
    if (saved && saved.intent.actor.userId !== claims.userId) throw denied()
    if (!saved) {
      if (request.action !== 'start') throw conflict()
      const database = contract.databaseSchema.parse(discovered)
      if (!same(database.scope, scope)) throw denied()
      const parent = (await db.query<{ login_session_hash: string }>('SELECT login_session_hash FROM page_studio_customer_editor_handoffs WHERE id=$1', [authority.handoffId])).rows[0]
      if (!parent) throw denied()
      const intent = contract.schema.parse({ ...database, version: 1, policyVersion: contract.schema.shape.policyVersion.value,
        operationId: randomUUID(), actor: { kind: 'customer-user', userId: claims.userId, loginSessionHash: parent.login_session_hash },
        sourceDigest: contract.schema.shape.sourceDigest.value, targetDigest: contract.schema.shape.targetDigest.value })
      saved = { intent, identity: await contract.identity(intent), claims, requestId: request.requestId }
      await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
        VALUES($1,$2,$3,$4,'customer',$5,$6,$7,$8,$9::jsonb)`, [scope.tenantId, scope.clientId, scope.siteId, claims.userId,
        `content.${contract.kind}-upgrade.requested`, `${contract.kind}_upgrade`, intent.operationId, `${contract.idempotencyPrefix}:customer:${claims.userId}:${request.requestId}`, JSON.stringify(saved)])
    }
    let head = await recovery(db, contract, saved)
    if (request.action === 'recover') {
      if (head?.recoveryId === request.requestId) {
        if (head.expectedRecoveryId !== request.expectedRecoveryId || !same(head.claims, claims)) throw conflict()
      } else {
        if ((head?.recoveryId ?? null) !== request.expectedRecoveryId || request.requestId === request.expectedRecoveryId) throw conflict()
        // A replay of an older request must not append a new head.
        if ((await db.query('SELECT id FROM page_studio_audit_events WHERE idempotency_key=$1', [`customer-upgrade-recovery:${request.kind}:${request.requestId}`])).rows.length) throw conflict()
        head = Recovery.parse({ revision: (head?.revision ?? 0) + 1, recoveryId: request.requestId, expectedRecoveryId: request.expectedRecoveryId, identity: saved.identity, claims })
        await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
          VALUES($1,$2,$3,$4,'customer',$5,$6,$7,$8,$9::jsonb)`, [scope.tenantId, scope.clientId, scope.siteId, claims.userId,
          `customer.${contract.kind}-upgrade.recovered`, `${contract.kind}_upgrade`, saved.intent.operationId, `customer-upgrade-recovery:${request.kind}:${request.requestId}`, JSON.stringify(head)])
      }
    }
    if (!same(head?.claims ?? saved.claims, claims)) {
      if (request.action === 'status') return { saved, head, reconciliation: true }
      throw conflict()
    }
    if (request.action === 'start' && request.requestId !== saved.requestId) throw conflict()
    await admission(db, contract, saved)
    return { saved, head, reconciliation: false }
  })
  if (prepared.reconciliation) return result('reconciliation', prepared.saved, prepared.head?.recoveryId)
  const raw = await invoke(request.action === 'status' ? contract.statusMethod : contract.executeMethod, prepared.saved.intent)
  const receipt = contract.receiptSchema
  const state = request.action === 'status'
    ? (raw === null
        ? { status: 'pending' }
        : (() => {
            const value = z.object({ state: z.enum(['reserved', 'running', 'installed', 'disabled']), leaseUntil: z.string().nullable(), receipt: receipt.nullable() }).strict().parse(raw)
            return { status: value.state, receipt: value.receipt }
          })())
    : z.discriminatedUnion('status', [z.object({ status: z.literal('running') }).strict(), z.object({ status: z.literal('installed'), receipt }).strict()]).parse(raw)
  const expected = contract.expectedReceipt(prepared.saved.intent)
  if (state.status === 'installed' && (!('receipt' in state) || !same(state.receipt, expected))) throw unavailable()
  const currentHead = await run(async (db) => {
    await authorize(db)
    const head = await admission(db, contract, prepared.saved)
    if (!same(head?.claims ?? prepared.saved.claims, claims)) throw conflict()
    return head
  })
  return result(state.status, prepared.saved, currentHead?.recoveryId)
}
