import { randomUUID } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { ContentAttachmentRequestSchema, contentAttachmentIdentity, requireMatchingContentAttachmentRequest } from '~~/shared/pageStudio/content-attachment'
import { loadPageStudioCheckpoint, type PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import { pageStudioAuthorityOwnerJoin } from './authoritySql'
import type { PageStudioContentActor } from './businessContent'
import type { PageStudioControlQueryClient } from './controlStore'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession } from './loginSessions'

const Body = z.object({
  requestId: z.string().uuid(),
  expectedCheckpointId: ContentAttachmentRequestSchema.shape.anchor.shape.checkpointId
}).strict()
const Artifacts = ContentAttachmentRequestSchema.pick({ schemaDigest: true, runtimeDigest: true, policyVersion: true })
const ModulePolicy = z.object({ allowedModules: z.array(z.string().min(1)).optional() })
type RunTransaction = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
interface Request {
  // Derived by native agency/portal auth, never copied from a request body.
  actor: PageStudioContentActor
  event?: H3Event
  siteId: string
  environment: 'staging' | 'production'
  // Server-owned reviewed artifact configuration. This service does not fetch code.
  artifacts: unknown
  bucket?: PageStudioCheckpointBucket
  body: unknown
}
const denied = () => createError({ statusCode: 403, statusMessage: 'CMS attachment access denied' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'CMS attachment request changed. Reload before trying again.' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'CMS attachment authority unavailable' })

/** Persist private intent only. No provisioning, page writes or public response.
 * The coordinator must reauthorize its retained original login before effects. */
export async function preparePageStudioContentAttachment(request: Request, dependencies: { runTransaction?: RunTransaction } = {}) {
  const body = Body.safeParse(request.body)
  if (!body.success || !z.string().uuid().safeParse(request.siteId).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid CMS attachment request' })
  }
  if (!request.event) throw createError({ statusCode: 401, statusMessage: 'Sign in again before connecting CMS storage' })
  const artifacts = Artifacts.safeParse(request.artifacts)
  if (!artifacts.success || !['staging', 'production'].includes(request.environment) || !request.bucket) throw unavailable()
  const { actor } = request
  const agency = actor.role === 'agency'
  if (!z.string().uuid().safeParse(actor.actorId).success || (agency && !actor.canEdit)) throw denied()
  const run: RunTransaction = dependencies.runTransaction ?? (work => transactionWithoutRetry(db => work(db as unknown as PageStudioControlQueryClient)))
  return run(async (db) => {
    // Lock site before native -> parent-login authority. NO KEY UPDATE lets
    // logout's audit FK check complete instead of introducing a lock cycle.
    const site = (await db.query<{ tenant_id: string, client_id: string, current_checkpoint_id: string | null }>(`
      SELECT tenant_id, client_id, current_checkpoint_id FROM page_studio_sites
      WHERE ${agency ? 'tenant_id' : 'client_id'}=$1 AND id=$2 FOR NO KEY UPDATE`,
    [agency ? actor.tenantId : actor.clientId, request.siteId])).rows[0]
    if (!site) throw createError({ statusCode: 404, statusMessage: 'Website not found' })
    const scope = { tenantId: site.tenant_id, clientId: site.client_id, businessId: site.client_id, siteId: request.siteId, environment: request.environment }
    const login = await resolvePageStudioLoginSession(db, request.event, actor.role, actor.actorId)
    await bindPageStudioLoginSession(db, login)

    // Reuse native provisioning owner rules: current staff edit permission or
    // active portal admin/manager plus exact editor membership and native login.
    const recheck = async () => {
      let row: { pages_limit: number, plan_metadata: unknown } | undefined
      try {
        row = (await db.query<{ pages_limit: number, plan_metadata: unknown }>(`
          SELECT entitlement.pages_per_site_limit AS pages_limit, entitlement.plan_metadata
          FROM page_studio_sites site
          JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
          JOIN page_studio_login_sessions login ON login.role=$5 AND login.token_hash=$6
            AND login.user_id=$4::text AND login.revoked_at IS NULL AND login.expires_at>clock_timestamp()
          ${pageStudioAuthorityOwnerJoin(agency, 'provisioning', 'clock_timestamp()')}
          JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id
            AND entitlement.tenant_id=site.tenant_id AND entitlement.client_id=site.client_id
            AND entitlement.status IN ('trial','active') AND entitlement.effective_from<=clock_timestamp()
            AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
            AND entitlement.active_site_limit>0 ${agency ? '' : 'AND entitlement.portal_creation_enabled'}
          WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3 AND site.status IN ('draft','active')
            AND (SELECT count(*) FROM page_studio_sites counted WHERE counted.tenant_id=site.tenant_id
              AND counted.client_id=site.client_id AND counted.status<>'archived')<=entitlement.active_site_limit
          FOR SHARE`, [scope.tenantId, scope.clientId, scope.siteId, actor.actorId, actor.role, login.tokenHash])).rows[0]
      } catch { throw unavailable() }
      const policy = ModulePolicy.safeParse(row?.plan_metadata)
      if (!row || !Number.isInteger(row.pages_limit) || row.pages_limit < 1 || !policy.success
        || (policy.data.allowedModules && !policy.data.allowedModules.includes('business-content'))) throw denied()
      return row.pages_limit
    }
    const pageLimit = await recheck()
    const args = [scope.tenantId, scope.clientId, scope.siteId]
    const idempotencyKey = `cms.attach:${actor.role}:${actor.actorId}:${body.data.requestId}`
    const existing = (await db.query<{ metadata: { body?: unknown, intent?: unknown, identity?: unknown } }>(`
      SELECT metadata FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3
        AND idempotency_key=$4 AND action='content.attachment.requested'`, [...args, idempotencyKey])).rows[0]
    const retained = existing && ContentAttachmentRequestSchema.safeParse(existing.metadata.intent)
    if (existing) {
      const savedBody = Body.safeParse(existing.metadata.body)
      if (!savedBody.success || JSON.stringify(savedBody.data) !== JSON.stringify(body.data) || !retained?.success) throw conflict()
    } else if (!site.current_checkpoint_id || site.current_checkpoint_id !== body.data.expectedCheckpointId) throw conflict()

    const checkpoint = (await db.query<{ id: string, digest: string, object_key: string }>(`
      SELECT id, digest, object_key FROM page_studio_checkpoints
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 FOR SHARE`, [...args, body.data.expectedCheckpointId])).rows[0]
    if (!checkpoint) throw conflict()
    const candidate = ContentAttachmentRequestSchema.parse({
      version: 1, mode: 'attach-existing-content', operationId: retained?.success ? retained.data.operationId : randomUUID(),
      scope, actor: { kind: agency ? 'agency-user' : 'client-user', userId: actor.actorId, loginSessionHash: login.tokenHash },
      anchor: { checkpointId: checkpoint.id, digest: checkpoint.digest }, ...artifacts.data
    })
    if (retained?.success) {
      try {
        requireMatchingContentAttachmentRequest(retained.data, candidate)
      } catch {
        throw conflict()
      }
    }
    const saved = await loadPageStudioCheckpoint({ scope, bucket: request.bucket!, checkpointId: checkpoint.id,
      objectKey: checkpoint.object_key, digests: [checkpoint.digest] })
    const pages = (saved.manifest as { pages?: unknown }).pages
    if (!Array.isArray(pages) || !pages.length || pages.length > pageLimit) throw denied()
    const identity = await contentAttachmentIdentity(candidate)
    if (existing && existing.metadata.identity !== identity) throw conflict()
    await recheck()
    if (!existing) {
      await db.query(`INSERT INTO page_studio_audit_events
        (tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
        VALUES($1,$2,$3,$4,$5,'content.attachment.requested','content_attachment',$6,$7,$8::jsonb)`,
      [...args, actor.actorId, actor.role, candidate.operationId, idempotencyKey, JSON.stringify({ body: body.data, intent: candidate, identity })])
    }
    // Wall-clock expiry can occur during any awaited I/O, including the insert.
    await recheck()
    return { intent: candidate, identity }
  })
}
