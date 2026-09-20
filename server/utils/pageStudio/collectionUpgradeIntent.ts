import { randomUUID } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { CollectionUpgradeOperationSchema, CollectionUpgradeDatabaseSchema, collectionUpgradeIdentity, type CollectionUpgradeOperation } from '~~/shared/pageStudio/collection-upgrade'
import type { PageStudioContentActor } from './businessContent'
import type { PageStudioControlQueryClient } from './controlStore'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession } from './loginSessions'
import { recheckPageStudioCollectionAuthority } from './collectionUpgradeAuthority'

const Body = z.object({ requestId: z.string().uuid() }).strict()
const denied = () => createError({ statusCode: 403, statusMessage: 'Collection upgrade access denied' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Collection upgrade request changed. Reload before trying again.' })
type Run = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
interface Request { actor: PageStudioContentActor, event?: H3Event, siteId: string, environment: 'staging' | 'production', body: unknown }

/** Private preparation, with no customer database mutation. The trusted resolver
 * must read the ready reservation for this scope. It runs outside native locks;
 * the upgrade coordinator rechecks the exact reservation before provider I/O. */
export async function preparePageStudioCollectionUpgrade(input: Request, dependencies: {
  resolveDatabase: (scope: CollectionUpgradeOperation['scope']) => Promise<unknown>
  runTransaction?: Run
}) {
  const body = Body.safeParse(input.body)
  if (!body.success || !z.string().uuid().safeParse(input.siteId).success) throw createError({ statusCode: 400, statusMessage: 'Invalid collection upgrade request' })
  if (!input.event) throw createError({ statusCode: 401, statusMessage: 'Sign in again before changing collection schemas' })
  const actor = structuredClone(input.actor), siteId = input.siteId, environment = input.environment, event = input.event
  if (!['staging', 'production'].includes(environment) || !z.string().uuid().safeParse(actor.actorId).success
    || (actor.role === 'agency' && !actor.canEdit)) throw denied()
  const run: Run = dependencies.runTransaction ?? (work => transactionWithoutRetry(db => work(db as unknown as PageStudioControlQueryClient)))
  const resolveDatabase = dependencies.resolveDatabase
  const agency = actor.role === 'agency'
  const native = await run(async (db) => {
    // Same site -> native login -> parent login lock order as CMS attachment.
    const site = (await db.query<{ tenant_id: string, client_id: string }>(`SELECT tenant_id,client_id FROM page_studio_sites
      WHERE ${agency ? 'tenant_id' : 'client_id'}=$1 AND id=$2 FOR NO KEY UPDATE`, [agency ? actor.tenantId : actor.clientId, siteId])).rows[0]
    if (!site) throw createError({ statusCode: 404, statusMessage: 'Website not found' })
    const login = await resolvePageStudioLoginSession(db, event, actor.role, actor.actorId)
    await bindPageStudioLoginSession(db, login)
    const native = {
      scope: { tenantId: site.tenant_id, clientId: site.client_id, businessId: site.client_id, siteId, environment },
      actor: { kind: agency ? 'agency-user' as const : 'client-user' as const, userId: actor.actorId, loginSessionHash: login.tokenHash }
    }
    await recheckPageStudioCollectionAuthority(db, native)
    return native
  })
  const database = CollectionUpgradeDatabaseSchema.safeParse(await resolveDatabase(structuredClone(native.scope)))
  if (!database.success || Object.entries(native.scope).some(([key, value]) => database.data.scope[key as keyof typeof native.scope] !== value)) throw denied()
  return run(async (db) => {
    const { scope } = native
    if (!(await db.query('SELECT id FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE',
      [scope.tenantId, scope.clientId, siteId])).rows[0]) throw denied()
    if (!agency && !(await db.query('SELECT token_hash FROM client_sessions WHERE token_hash=$1 AND client_user_id=$2 FOR SHARE',
      [native.actor.loginSessionHash, actor.actorId])).rows[0]) throw denied()
    if (!(await db.query('SELECT token_hash FROM page_studio_login_sessions WHERE role=$1 AND token_hash=$2 AND user_id=$3 FOR SHARE',
      [actor.role, native.actor.loginSessionHash, actor.actorId])).rows[0]) throw denied()
    await recheckPageStudioCollectionAuthority(db, native, true)
    // A lock wait can cross expiry. Re-evaluate at a fresh statement snapshot.
    await recheckPageStudioCollectionAuthority(db, native)
    const rows = (await db.query<{ metadata: { intent?: unknown, identity?: unknown, body?: unknown }, idempotency_key: string }>(`
      SELECT metadata,idempotency_key FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3
        AND action='content.collection-upgrade.requested' AND resource_type='collection_upgrade'
        AND metadata->'intent'->'scope'->>'environment'=$4`, [scope.tenantId, scope.clientId, siteId, environment])).rows
    if (rows.length > 1) throw conflict()
    const existing = rows[0], retained = existing && CollectionUpgradeOperationSchema.safeParse(existing.metadata.intent)
    const idempotencyKey = `cms.collections:${actor.role}:${actor.actorId}:${body.data.requestId}`
    if (existing && (!retained?.success || existing.idempotency_key !== idempotencyKey
      || JSON.stringify(Body.safeParse(existing.metadata.body).data) !== JSON.stringify(body.data))) throw conflict()
    const intent = CollectionUpgradeOperationSchema.parse({ ...database.data, ...native,
      operationId: retained?.success ? retained.data.operationId : randomUUID(), version: 1, policyVersion: 'collection-upgrade-v1',
      sourceDigest: CollectionUpgradeOperationSchema.shape.sourceDigest.value, targetDigest: CollectionUpgradeOperationSchema.shape.targetDigest.value })
    const identity = await collectionUpgradeIdentity(intent)
    if (existing && (!retained?.success || JSON.stringify(retained.data) !== JSON.stringify(intent) || existing.metadata.identity !== identity)) throw conflict()
    if ((await db.query(`SELECT id FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3
      AND action='content.collection-upgrade.disabled' AND resource_type='collection_upgrade' AND resource_id=$4`,
    [scope.tenantId, scope.clientId, siteId, intent.operationId])).rows.length) throw denied()
    if (!existing) await db.query(`INSERT INTO page_studio_audit_events
      (tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
      VALUES($1,$2,$3,$4,$5,'content.collection-upgrade.requested','collection_upgrade',$6,$7,$8::jsonb)`,
    [scope.tenantId, scope.clientId, siteId, actor.actorId, actor.role, intent.operationId, idempotencyKey, JSON.stringify({ body: body.data, intent, identity })])
    await recheckPageStudioCollectionAuthority(db, native)
    return { intent, identity }
  })
}
