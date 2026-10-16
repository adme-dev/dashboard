import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { PageStudioContentScopeSchema, type PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import type { CmsObjectPin } from '~~/shared/pageStudio/cmsManaged'
import { authorizePageStudioBusinessContent, PageStudioBusinessContentError } from './businessContent'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import { cmsEqual, decodeCmsObject, lockCmsContext, type AcceptedCmsObject } from './cmsVisibility'
import type { PageStudioCheckpointInput, PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'

export type CmsGraphPrincipal = Parameters<typeof withCmsCommitAuthority>[0]['principal']
export type CmsGraphDependencies = NonNullable<Parameters<typeof withCmsCommitAuthority>[2]>
export interface CmsGraphSnapshot {
  scope: PageStudioContentScope
  context: Awaited<ReturnType<typeof lockCmsContext>>
  checkpoint: { id: string, digest: string, object_key: string }
  schemas: AcceptedCmsObject[]
  content: AcceptedCmsObject | null
  actor: { kind: 'agency-user' | 'client-user' | 'customer-user', userId: string, loginSessionHash: string }
  principalIdentity: { source: CmsGraphPrincipal['source'], nonce: string | null }
}
export interface CmsGraphTransitionInput {
  operationId: string
  candidateId: string
  candidateDigest: string
  privacyReviewDigest?: string
  expectedApplication: { id: string, digest: string }
  expectedCheckpoint: { id: string, digest: string }
  expectedContent: CmsObjectPin | null
  contentRevision: number
  nextCheckpoint: PageStudioCheckpointInput
  preparations: Array<{ operationId: string, requestDigest: string, receiptDigest: string }>
  summary: string
}
export const cmsGraphConflict = (message = 'The accepted website changed. Refresh before trying again.') =>
  new PageStudioBusinessContentError('CMS_GRAPH_CONFLICT', 409, message)
export const cmsAuthoringScopeConflict = () => new PageStudioBusinessContentError(
  'CMS_AUTHORING_SCOPE_CONFLICT', 409,
  'This website already has an authoring environment. Continue there; published delivery does not require another authoring setup.'
)
export function cmsGraphEnvironment(principal: CmsGraphPrincipal) {
  return principal.source === 'native-login' ? principal.request.env : principal.env
}
export function graphCheckpointMutation(principal: CmsGraphPrincipal) {
  return principal.source === 'customer-session' ? 'customer-checkpoint' as const : 'business-content' as const
}
const denyCustomerGraphOperation = () => new PageStudioBusinessContentError('CMS_GRAPH_AUTHORITY_DENIED', 403, 'Customer sessions allow ordinary page saves only.')
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
async function resolveScope(principal: CmsGraphPrincipal, deps: CmsGraphDependencies) {
  if (principal.source !== 'native-login') return PageStudioContentScopeSchema.parse({
    tenantId: principal.claims.tenantId, clientId: principal.claims.clientId,
    businessId: principal.claims.clientId, siteId: principal.claims.siteId,
    environment: principal.env.PAGE_STUDIO_CONTENT_ENVIRONMENT
  })
  const run = deps.runTransaction ?? (work => transactionWithoutRetry(db => work(db)))
  return await run(async db => (await authorizePageStudioBusinessContent(principal.request, true, {
    policyOnly: true,
    query: async (sql, params) => (await db.query<import('./businessContent').ScopeRow>(sql, params)).rows[0] ?? null
  })).scope)
}
export async function assertSoleCmsAuthoringScope(db: PageStudioControlQueryClient, scope: PageStudioContentScope) {
  const rows = (await db.query<{ environment: string, state: string }>(
    `SELECT environment,state FROM page_studio_cms_scopes WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND state IN ('freezing','importing','managed','blocked')`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )).rows
  if (rows.length !== 1 || rows[0]!.environment !== scope.environment) throw cmsAuthoringScopeConflict()
  if (rows[0]!.state !== 'managed') throw cmsGraphConflict('Content setup must finish before saving the website.')
}
export async function snapshotInTransaction(db: PageStudioControlQueryClient, scope: PageStudioContentScope, principal: CmsGraphPrincipal): Promise<CmsGraphSnapshot> {
  await assertSoleCmsAuthoringScope(db, scope)
  const context = await lockCmsContext(db, scope)
  const rows = (await db.query(
    `SELECT cp.id,cp.digest,cp.object_key FROM page_studio_sites site JOIN page_studio_checkpoints cp ON cp.tenant_id=site.tenant_id AND cp.client_id=site.client_id AND cp.site_id=site.id AND cp.id=site.current_checkpoint_id WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )).rows
  const checkpoint = z.object({ id: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/), object_key: z.string() }).parse(rows.length === 1 ? rows[0] : null)
  if (!cmsEqual({ id: checkpoint.id, digest: checkpoint.digest }, context.application.manifest.checkpoint)) throw cmsGraphConflict()
  const ids = [...context.selections.map(item => item.object_id), ...(context.state.current_content_id ? [context.state.current_content_id] : [])]
  const objects = ids.length
    ? (await db.query(
        'SELECT * FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND id=ANY($3::uuid[])',
        [context.state.scope_key, context.state.active_generation, ids]
      )).rows.map(row => decodeCmsObject(row, context))
    : []
  if (objects.length !== ids.length) throw cmsGraphConflict('Accepted schema metadata is unavailable.')
  const schemas = context.selections.map((selection) => {
    const object = objects.find(item => item.id === selection.object_id)
    if (!object || object.pin.kind !== 'schema' || object.pin.collectionId !== selection.collection_id) throw cmsGraphConflict()
    return object
  })
  const content = objects.find(item => item.id === context.state.current_content_id) ?? null
  if (content && content.pin.kind !== 'content') throw cmsGraphConflict()
  const role = principal.source === 'native-login' ? principal.request.actor.role : principal.claims.role
  const userId = principal.source === 'native-login' ? principal.request.actor.actorId : principal.claims.userId
  const loginSessionHash = principal.source === 'native-login'
    ? principal.request.login.tokenHash
    : z.object({ login_session_hash: z.string().regex(/^[a-f0-9]{64}$/) }).parse((await db.query(
      principal.source === 'customer-session'
        ? `SELECT handoff.login_session_hash FROM page_studio_customer_editor_sessions child JOIN page_studio_customer_editor_handoffs handoff ON handoff.id=child.handoff_id WHERE child.nonce=$1 AND handoff.identity_id=$2`
        : 'SELECT login_session_hash FROM page_studio_sessions WHERE nonce=$1 AND user_id=$2', [principal.claims.nonce, userId]
    )).rows[0]).login_session_hash
  const actor = { kind: role === 'agency' ? 'agency-user' as const : role === 'customer' ? 'customer-user' as const : 'client-user' as const, userId, loginSessionHash }
  const principalIdentity = { source: principal.source, nonce: principal.source !== 'native-login' ? principal.claims.nonce : null }
  return freeze(structuredClone({ scope, context, checkpoint, schemas, content, actor, principalIdentity }))
}
/** Authoritative snapshot only. Immutable remote bodies are loaded after locks release. */
export async function readCmsGraphSnapshot(principal: CmsGraphPrincipal, deps: CmsGraphDependencies = {}): Promise<CmsGraphSnapshot> {
  const scope = await resolveScope(principal, deps)
  return await withCmsCommitAuthority({ scope, principal, mutation: graphCheckpointMutation(principal) }, db => snapshotInTransaction(db, scope, principal), deps)
}
/** Discovery rechecks native authority and exact accepted heads after private I/O. */
export async function assertCmsGraphSnapshotCurrent(snapshot: CmsGraphSnapshot, principal: CmsGraphPrincipal, deps: CmsGraphDependencies = {}) {
  const current = await readCmsGraphSnapshot(principal, deps)
  if (!cmsEqual(snapshot, current)) throw cmsGraphConflict()
}

export interface CmsGraphCommitReceipt {
  acknowledged: true
  operationId: string
  checkpointId: string
  application: { id: string, digest: string }
  versionId: string | null
  currentCheckpointId: string | null
  isCurrent: boolean
}
/** Fresh native authorization on every retry; no remote bytes are needed. */
export async function lookupCmsGraphOperation(
  operationId: string,
  principal: CmsGraphPrincipal,
  expectedCandidate: { id: string, digest: string },
  deps: CmsGraphDependencies = {}
): Promise<CmsGraphCommitReceipt | null> {
  if (principal.source === 'customer-session') throw denyCustomerGraphOperation()
  z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).parse(operationId)
  const scope = await resolveScope(principal, deps)
  const result = await withCmsCommitAuthority({ scope, principal, mutation: graphCheckpointMutation(principal) }, async (db) => {
    const snapshot = await snapshotInTransaction(db, scope, principal)
    const rows = (await db.query<{ request: { intent: CmsGraphTransitionInput, actor: CmsGraphSnapshot['actor'], principalIdentity: CmsGraphSnapshot['principalIdentity'], mutation: string }, result: CmsGraphCommitReceipt }>(
      'SELECT request,result FROM page_studio_cms_commits WHERE scope_key=$1 AND operation_id=$2', [snapshot.context.state.scope_key, operationId]
    )).rows
    if (!rows.length) return null
    const row = rows[0]!
    if (rows.length !== 1 || row.request.intent?.candidateId !== expectedCandidate.id || row.request.intent?.candidateDigest !== expectedCandidate.digest
      || !cmsEqual(row.request.actor, snapshot.actor) || !cmsEqual(row.request.principalIdentity, snapshot.principalIdentity)) throw cmsGraphConflict('This operation identity was already used for another request.')
    return { mutation: row.request.mutation, receipt: { ...row.result, currentCheckpointId: snapshot.checkpoint.id,
      isCurrent: row.result.checkpointId === snapshot.checkpoint.id && row.result.application.id === snapshot.context.application.id } }
  }, deps)
  if (result?.mutation === 'collection-schema') await withCmsCommitAuthority({ scope, principal, mutation: 'collection-schema' }, async () => {}, deps)
  return result?.receipt ?? null
}
