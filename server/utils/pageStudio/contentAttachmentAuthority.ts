import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { ContentAttachmentRequestSchema, contentAttachmentIdentity, requireMatchingContentAttachmentRequest, type ContentAttachmentRequest } from '~~/shared/pageStudio/content-attachment'
import { pageStudioAuthorityOwnerJoin } from './authoritySql'
import type { PageStudioControlQueryClient } from './controlStore'

const denied = () => createError({ statusCode: 403, statusMessage: 'CMS attachment access denied' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'CMS attachment authority unavailable' })
const ModulePolicy = z.object({ allowedModules: z.array(z.string().min(1)).optional() })
type RunTransaction = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>

export async function recheckContentAttachmentAuthority(db: PageStudioControlQueryClient, request: Pick<ContentAttachmentRequest, 'scope' | 'actor'>) {
  const { scope, actor } = request
  const agency = actor.kind === 'agency-user'
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
          FOR SHARE`, [scope.tenantId, scope.clientId, scope.siteId, actor.userId, agency ? 'agency' : 'client', actor.loginSessionHash])).rows[0]
  } catch { throw unavailable() }
  const policy = ModulePolicy.safeParse(row?.plan_metadata)
  if (!row || !Number.isInteger(row.pages_limit) || row.pages_limit < 1 || !policy.success
    || (policy.data.allowedModules && !policy.data.allowedModules.includes('business-content'))) throw denied()
  return row.pages_limit
}

/** Private control-plane check. Only an exact persisted native intent can select
 * the originating login. Never use a caller-provided identity as an auth grant. */
export async function withPageStudioContentAttachmentAuthority<T>(input: unknown, environment: 'staging' | 'production', work: (db: PageStudioControlQueryClient, request: ContentAttachmentRequest) => Promise<T>, dependencies: { runTransaction?: RunTransaction } = {}) {
  const parsed = ContentAttachmentRequestSchema.safeParse(input)
  if (!parsed.success || parsed.data.scope.environment !== environment || !['staging', 'production'].includes(environment)) throw denied()
  const request = parsed.data
  const { scope, actor } = request
  const run: RunTransaction = dependencies.runTransaction ?? (work => transactionWithoutRetry(db => work(db as unknown as PageStudioControlQueryClient)))
  return run(async (db) => {
    // Preparation locks site before its native-login upsert. Match that order
    // before taking any login locks; concurrent authorization reads may share it.
    if (!(await db.query(`SELECT id FROM page_studio_sites
      WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR SHARE`,
    [scope.tenantId, scope.clientId, scope.siteId])).rows[0]) throw denied()
    const retained = (await db.query<{ metadata: { intent?: unknown, identity?: unknown, pageCount?: unknown }, actor_id: string, actor_role: string }>(`
      SELECT metadata, actor_id, actor_role FROM page_studio_audit_events
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND resource_id=$4
        AND action='content.attachment.requested' AND resource_type='content_attachment' FOR SHARE`,
    [scope.tenantId, scope.clientId, scope.siteId, request.operationId])).rows
    if (retained.length !== 1) throw denied()
    const saved = retained[0]!
    try {
      requireMatchingContentAttachmentRequest(saved.metadata.intent, request)
    } catch { throw denied() }
    if (saved.actor_id !== actor.userId || saved.actor_role !== (actor.kind === 'agency-user' ? 'agency' : 'client')
      || saved.metadata.identity !== await contentAttachmentIdentity(request)
      || !Number.isSafeInteger(saved.metadata.pageCount) || (saved.metadata.pageCount as number) < 1) throw denied()
    // Match logout's native -> parent-login lock order. These locks live until
    // this short authority transaction completes, never across provider I/O.
    if (actor.kind === 'client-user' && !(await db.query(`SELECT token_hash FROM client_sessions
      WHERE token_hash=$1 AND client_user_id=$2 AND expires_at>clock_timestamp() FOR SHARE`,
    [actor.loginSessionHash, actor.userId])).rows[0]) throw denied()
    if (!(await db.query(`SELECT token_hash FROM page_studio_login_sessions
      WHERE role=$1 AND token_hash=$2 AND user_id=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE`,
    [saved.actor_role, actor.loginSessionHash, actor.userId])).rows[0]) throw denied()
    const checkpoint = (await db.query<{ digest: string }>(`SELECT digest FROM page_studio_checkpoints
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 FOR SHARE`,
    [scope.tenantId, scope.clientId, scope.siteId, request.anchor.checkpointId])).rows[0]
    if (checkpoint?.digest !== request.anchor.digest) throw denied()
    // A locking SELECT may evaluate time predicates before waiting on a row.
    // Acquire all authority locks, then evaluate expiry in a fresh statement.
    await recheckContentAttachmentAuthority(db, request)
    if (await recheckContentAttachmentAuthority(db, request) < (saved.metadata.pageCount as number)) throw denied()
    const result = await work(db, request)
    if (await recheckContentAttachmentAuthority(db, request) < (saved.metadata.pageCount as number)) throw denied()
    return result
  })
}

export function authorizePageStudioContentAttachment(input: unknown, environment: 'staging' | 'production', dependencies: { runTransaction?: RunTransaction } = {}) {
  return withPageStudioContentAttachmentAuthority(input, environment, (_db, request) => Promise.resolve(request), dependencies)
}
