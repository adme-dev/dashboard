import { checkpointStagingOrigin } from './checkpointStagingOrigin'
import { randomUUID } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { lockPageStudioHistoryAuthority } from './historyAuthority'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { commitPageStudioCheckpoint, registerPageStudioVersion, submitPageStudioVersionForReview, type PageStudioControlQueryClient, type PageStudioControlScope } from '~~/server/utils/pageStudio/controlStore'
import { loadPageStudioCheckpoint, type PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import { PageStudioHistoryMutationSchema, PageStudioHistoryQuerySchema, type PageStudioHistoryReceipt, type PageStudioHistoryState } from '~~/shared/pageStudio/draftHistory'
import type { PageStudioContentActor } from '~~/server/utils/pageStudio/businessContent'

export class PageStudioHistoryError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message)
    this.name = 'PageStudioHistoryError'
  }
}
interface Bucket extends PageStudioCheckpointBucket {
  put(key: string, body: string, options?: unknown): Promise<{
    etag: string
  } | null>
}
interface Request {
  actor: PageStudioContentActor
  siteId: string
  bucket?: Bucket
  event?: H3Event
  env?: Record<string, unknown>
}
interface SiteRow {
  tenant_id: string
  client_id: string
  name: string
  status: string
  current_checkpoint_id: string | null
  current_version_id: string | null
  entitlement_status: string
  entitlement_effective: boolean
  pages_per_site_limit: number
}
type RunTransaction = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
interface Dependencies {
  runTransaction?: RunTransaction
}
const defaultTransaction: RunTransaction = work => transactionWithoutRetry(db => work(db as unknown as PageStudioControlQueryClient))
const invalid = () => new PageStudioHistoryError('HISTORY_INVALID', 400, 'Invalid draft history request')
const conflict = () => new PageStudioHistoryError('DRAFT_CHANGED', 409, 'The saved draft changed. Refresh history before trying again.')
const denied = () => new PageStudioHistoryError('HISTORY_ACCESS_DENIED', 403, 'Draft history access denied')
// Site and membership locks span the full mutation, including durable blob storage.
async function authorise(db: PageStudioControlQueryClient, request: Request, writing: boolean) {
  const { actor, siteId } = request
  if (!z.string().uuid().safeParse(siteId).success)
    throw invalid()
  if (!actor.actorId || (actor.role === 'agency' && writing && !actor.canEdit))
    throw denied()
  const client = actor.role === 'client'
  const result = await db.query<SiteRow>(`
    SELECT site.tenant_id, site.client_id, site.name, site.status, site.current_checkpoint_id, site.current_version_id,
      entitlement.status AS entitlement_status, entitlement.pages_per_site_limit,
      (entitlement.effective_from <= NOW() AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())) AS entitlement_effective
    FROM page_studio_sites site
    JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
    JOIN page_studio_entitlements entitlement ON entitlement.tenant_id = site.tenant_id
      AND entitlement.client_id = site.client_id AND entitlement.id = site.entitlement_id
    WHERE site.${client ? 'client_id' : 'tenant_id'} = $1 AND site.id = $2
    ${writing ? 'FOR NO KEY UPDATE OF site' : 'FOR SHARE OF site'} FOR SHARE OF entitlement, client`, [client ? actor.clientId : actor.tenantId, siteId])
  const site = result.rows[0]
  if (!site)
    throw new PageStudioHistoryError('SITE_NOT_FOUND', 404, 'Website not found')
  let canEdit = actor.role === 'agency' && actor.canEdit
  if (client) {
    const membership = await db.query<{
      role: string
    }>(`SELECT role FROM page_studio_site_memberships
      WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND user_id = $4 FOR SHARE`, [site.tenant_id, site.client_id, siteId, actor.actorId])
    if (!['viewer', 'editor'].includes(membership.rows[0]?.role ?? ''))
      throw denied()
    canEdit = membership.rows[0]?.role === 'editor'
  }
  if (!['draft', 'active'].includes(site.status) || (writing && (!canEdit
    || !['trial', 'active'].includes(site.entitlement_status) || !site.entitlement_effective)))
    throw denied()
  canEdit = canEdit && ['trial', 'active'].includes(site.entitlement_status) && site.entitlement_effective
  const scope: PageStudioControlScope = { tenantId: site.tenant_id, clientId: site.client_id, siteId }
  return { site, scope, canEdit }
}
const CursorSchema = z.object({ kind: z.enum(['drafts', 'versions']), createdAt: z.string().datetime({ offset: true }), id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/) }).strict()
export async function readPageStudioHistory(request: Request & {
  query: unknown
}, dependencies: Dependencies = {}): Promise<PageStudioHistoryState> {
  const parsed = PageStudioHistoryQuerySchema.safeParse(request.query)
  if (!parsed.success)
    throw invalid()
  const { kind, limit, cursor } = parsed.data
  let before: z.infer<typeof CursorSchema> | undefined
  if (cursor) {
    try {
      before = CursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
    } catch {
      throw invalid()
    }
    if (before.kind !== kind || (kind === 'versions' && !z.string().uuid().safeParse(before.id).success))
      throw invalid()
  }
  return (dependencies.runTransaction ?? defaultTransaction)(async (db) => {
    const { site, scope, canEdit } = await authorise(db, request, false)
    const versions = kind === 'versions'
    const result = await db.query<{
      id: string
      checkpoint_id: string
      name: string | null
      created_at: string
      status: string
    }>(`
      SELECT id, ${versions ? 'checkpoint_id, summary AS name, status' : 'id AS checkpoint_id, NULL AS name, \'saved\' AS status'},
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
      FROM ${versions ? 'page_studio_versions' : 'page_studio_checkpoints'}
      WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3
        ${before ? `AND (created_at, id) < ($5::timestamptz, $6${versions ? '::uuid' : '::text'})` : ''}
      ORDER BY created_at DESC, id DESC LIMIT $4`, [scope.tenantId, scope.clientId, scope.siteId, limit + 1, ...(before ? [before.createdAt, before.id] : [])])
    const rows = result.rows.slice(0, limit), last = rows.at(-1)
    return {
      siteName: site.name, currentCheckpointId: site.current_checkpoint_id, currentVersionId: site.current_version_id, canEdit,
      items: rows.map(row => ({ id: row.id, checkpointId: row.checkpoint_id, name: row.name, createdAt: row.created_at, status: row.status })),
      nextCursor: result.rows.length > limit && last ? Buffer.from(JSON.stringify({ kind, id: last.id, createdAt: last.created_at })).toString('base64url') : null
    }
  })
}
export async function mutatePageStudioHistory(request: Request & {
  body: unknown
}, dependencies: Dependencies = {}): Promise<PageStudioHistoryReceipt> {
  const parsed = PageStudioHistoryMutationSchema.safeParse(request.body)
  if (!parsed.success)
    throw invalid()
  if (!request.event) throw createError({ statusCode: 401, statusMessage: 'Sign in again before changing draft history' })
  const body = parsed.data
  if (body.action === 'name' && body.submitForReview && request.actor.role !== 'agency')
    throw denied()
  if (body.action === 'restore') {
    const managed = await (dependencies.runTransaction ?? defaultTransaction)(async (db) => {
      const { scope } = await authorise(db, request, true)
      return (await db.query(`SELECT scope_key FROM page_studio_cms_scopes WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND state<>'legacy' LIMIT 1`, [scope.tenantId, scope.clientId, scope.siteId])).rows.length > 0
    })
    if (managed) {
      const { coordinateCmsGraphRestore } = await import('./cmsGraphCoordinator')
      const { preparePageStudioContentLogin } = await import('./contentNativeLogin')
      const contentRequest = { actor: request.actor, login: await preparePageStudioContentLogin(request.event, request.actor), siteId: request.siteId, env: request.env ?? {} }
      return await coordinateCmsGraphRestore(body, { source: 'native-login', request: contentRequest }, dependencies)
    }
  }
  return (dependencies.runTransaction ?? defaultTransaction)(async (db) => {
    const { site, scope } = await authorise(db, request, true)
    if (body.action === 'restore' && (await db.query(`SELECT scope_key FROM page_studio_cms_scopes WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND state<>'legacy' LIMIT 1`, [scope.tenantId, scope.clientId, scope.siteId])).rows.length)
      throw new PageStudioHistoryError('HISTORY_MANAGED_RETRY', 409, 'Content setup changed. Retry this restore through the current authoring environment.')
    const { recheck: recheckAuthority, login } = await lockPageStudioHistoryAuthority(db, request.event!, request.actor, scope)
    const args = [scope.tenantId, scope.clientId, scope.siteId]
    const operationKey = `history:${request.actor.role}:${request.actor.actorId}:${body.requestId}`
    const existing = await db.query<{
      metadata: {
        request: unknown
        checkpointId: string
        versionId?: string
      }
    }>(`
      SELECT metadata FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3
        AND idempotency_key=$4 AND action='draft.history.saved'`, [...args, operationKey])
    const receipt = existing.rows[0]?.metadata
    if (receipt) {
      // Parsed requests have a fixed key order, independent of JSONB key ordering.
      const original = PageStudioHistoryMutationSchema.safeParse(receipt.request)
      if (!original.success || JSON.stringify(original.data) !== JSON.stringify(body))
        throw conflict()
      await recheckAuthority()
      return { checkpointId: receipt.checkpointId, ...(receipt.versionId ? { versionId: receipt.versionId } : {}),
        currentCheckpointId: site.current_checkpoint_id, isCurrent: site.current_checkpoint_id === receipt.checkpointId && (!receipt.versionId || site.current_version_id === receipt.versionId) }
    }
    if (site.current_checkpoint_id !== body.expectedCheckpointId)
      throw conflict()
    const sourceId = body.action === 'restore' ? body.checkpointId : body.expectedCheckpointId
    const source = await db.query<{
      digest: string
      object_key: string
    }>(`SELECT digest, object_key FROM page_studio_checkpoints
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 FOR SHARE`, [...args, sourceId])
    if (!source.rows[0])
      throw new PageStudioHistoryError('CHECKPOINT_NOT_FOUND', 404, 'Saved draft not found')
    let checkpointId = sourceId
    let versionId: string | undefined
    const nested: RunTransaction = work => work(db)
    if (body.action === 'name') {
      const version = await registerPageStudioVersion({ scope, authorRole: request.actor.role, userId: request.actor.actorId,
        checkpointId, digest: source.rows[0].digest, summary: body.name, idempotencyKey: operationKey }, { runTransaction: nested })
      versionId = version.id
      if (body.submitForReview) {
        await submitPageStudioVersionForReview({ scope, actorRole: request.actor.role, userId: request.actor.actorId,
          versionId, idempotencyKey: `${operationKey}:submit` }, { runTransaction: nested })
      }
    } else {
      if (!request.bucket || typeof request.bucket.put !== 'function')
        throw new PageStudioHistoryError('CHECKPOINT_UNAVAILABLE', 503, 'Draft storage is unavailable. Try again.')
      const saved = await loadPageStudioCheckpoint({ scope, bucket: request.bucket, checkpointId: sourceId,
        objectKey: source.rows[0].object_key, digests: [source.rows[0].digest] })
      const pages = (saved.manifest as {
        pages?: unknown
      }).pages
      if (!Array.isArray(pages) || pages.length > site.pages_per_site_limit) {
        throw new PageStudioHistoryError('PAGE_LIMIT_REACHED', 409, 'This saved draft exceeds the current page allowance or cannot be restored.')
      }
      checkpointId = `restore_${randomUUID()}`
      const createdAt = new Date().toISOString()
      const objectKey = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${checkpointId}.json`
      const envelope = JSON.stringify({ schemaVersion: 1, checkpointId, createdAt, digest: saved.digest,
        manifest: saved.manifest, scope, userId: request.actor.actorId })
      if (new TextEncoder().encode(envelope).byteLength > 8 * 1024 * 1024)
        throw new PageStudioHistoryError('CHECKPOINT_TOO_LARGE', 422, 'The restored draft exceeds the storage limit.')
      let etag: string
      try {
        const stored = await request.bucket.put(objectKey, envelope, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } })
        if (!stored?.etag)
          throw new Error('Storage did not acknowledge')
        etag = stored.etag
      } catch {
        throw new PageStudioHistoryError('CHECKPOINT_UNAVAILABLE', 503, 'The restored draft could not be saved. Try again.')
      }
      await commitPageStudioCheckpoint({ expectedCheckpointId: body.expectedCheckpointId,
        checkpoint: { scope, checkpointId, createdAt, digest: saved.digest, etag, objectKey, userId: request.actor.actorId } }, { runTransaction: nested,
        stagingOrigin: async () => checkpointStagingOrigin({ formatVersion: 1, environment: request.env?.PAGE_STUDIO_RELEASE_ENVIRONMENT,
          source: 'native-login', userId: login.userId, role: login.role, loginSessionHash: login.tokenHash }) })
      await db.query('UPDATE page_studio_sites SET current_version_id=NULL WHERE tenant_id=$1 AND client_id=$2 AND id=$3', args)
    }
    await db.query(`INSERT INTO page_studio_audit_events
      (tenant_id, client_id, site_id, actor_id, actor_role, action, resource_type, resource_id, idempotency_key, metadata)
      VALUES ($1,$2,$3,$4,$5,'draft.history.saved',$6,$7,$8,$9::jsonb)`, [...args, request.actor.actorId, request.actor.role, versionId ? 'version' : 'checkpoint', versionId ?? checkpointId,
      operationKey, JSON.stringify({ request: body, checkpointId, ...(versionId ? { versionId } : {}) })])
    await recheckAuthority()
    return { checkpointId, ...(versionId ? { versionId } : {}), currentCheckpointId: checkpointId, isCurrent: true }
  })
}
