import { createError, type H3Event } from 'h3'
import { transaction } from '~~/server/utils/db'
import { redeemCustomerEditorHandoff } from './customerEditorHandoff'
import { readCustomerProvisioningPreviewAuthority, readCustomerSessionIdentityFromHash } from './customerProvisioning'
import { CustomerEditorClaimsSchema, CustomerEditorCapabilitySchema, CUSTOMER_EDITOR_MAX_SECONDS, signCustomerEditorToken,
  type CustomerEditorClaims } from './customerEditorToken'
import { resolvePageStudioSessionEnvironment } from './sessions'
import { PageStudioCheckpointCommitSchema } from './controlSchemas'
import { commitPageStudioCheckpoint, getLatestPageStudioCheckpoint } from './controlStore'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

const denied = () => createError({ statusCode: 403, statusMessage: 'Customer editor access is not available.' })
interface Dependencies { runTransaction?: RunPageStudioTransaction }
interface AuthorityReceipt {
  handoff_id: string
  login_session_hash: string
  identity_id: string
  workspace_id: string
  site_id: string
  business_id: string
  tenant_id: string
  dashboard_origin: string
  editor_origin: string
}
function parseClaims(input: unknown) {
  const parsed = CustomerEditorClaimsSchema.safeParse(input)
  if (!parsed.success) throw denied()
  return parsed.data
}

/** Native rows remain locked through caller-owned reads/commits. No cached admission. */
export async function assertCustomerEditorSessionAuthority(input: unknown, capability: unknown, db: PageStudioQueryClient) {
  const claims = parseClaims(input)
  const requested = CustomerEditorCapabilitySchema.safeParse(capability)
  if (!requested.success || !claims.capabilities.includes(requested.data)) throw denied()
  const args = [claims.nonce, JSON.stringify(claims)]
  const receipt = (await db.query<AuthorityReceipt>(`SELECT session.handoff_id, handoff.*
    FROM page_studio_customer_editor_sessions session
    JOIN page_studio_customer_editor_handoffs handoff ON handoff.id = session.handoff_id
    WHERE session.nonce = $1 AND session.claims = $2::jsonb AND session.revoked_at IS NULL
      AND session.issued_at <= clock_timestamp() AND session.expires_at > clock_timestamp()
      AND handoff.consumed_at IS NOT NULL`, args)).rows[0]
  if (!receipt || receipt.identity_id !== claims.userId || receipt.workspace_id !== claims.workspaceId
    || receipt.site_id !== claims.siteId || receipt.business_id !== claims.clientId || receipt.tenant_id !== claims.tenantId
    || receipt.editor_origin !== claims.editorOrigin || `${receipt.dashboard_origin}/studio/dashboard` !== claims.returnUrl) throw denied()
  const identityId = await readCustomerSessionIdentityFromHash(db, receipt.login_session_hash)
  if (identityId !== claims.userId) throw denied()
  const owned = await readCustomerProvisioningPreviewAuthority(db, claims.siteId, identityId)
  if (owned.workspaceId !== claims.workspaceId || owned.scope.businessId !== claims.clientId || owned.scope.tenantId !== claims.tenantId) throw denied()
  // Lock child last. Recheck time-based parent/membership authority after any wait.
  const child = (await db.query(`SELECT nonce FROM page_studio_customer_editor_sessions
    WHERE nonce = $1 AND claims = $2::jsonb AND revoked_at IS NULL AND expires_at > clock_timestamp() FOR SHARE`, args)).rows[0]
  if (!child) throw denied()
  await readCustomerSessionIdentityFromHash(db, receipt.login_session_hash)
  await readCustomerProvisioningPreviewAuthority(db, claims.siteId, identityId)
  const active = (await db.query(`SELECT nonce FROM page_studio_customer_editor_sessions
    WHERE nonce = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()`, [claims.nonce])).rows[0]
  if (!active) throw denied()
  return { claims, handoffId: receipt.handoff_id, owned }
}

/** Consume, persist and sign atomically. A failed exchange can retry the SAME ticket. */
export async function exchangeCustomerEditorSession(ticket: unknown, configuration: unknown, dependencies: Dependencies & {
  event?: H3Event
  signToken?: (claims: CustomerEditorClaims) => Promise<string>
} = {}) {
  const environment = dependencies.signToken ? null : resolvePageStudioSessionEnvironment(dependencies.event)
  const sign = dependencies.signToken ?? (claims => signCustomerEditorToken(claims, environment!.privateKey, environment!.issuer))
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const context = await redeemCustomerEditorHandoff(ticket, configuration, { runTransaction: callback => callback(db) })
    const parent = (await db.query<{ issued: number, expires: number, editor_origin: string }>(`SELECT
      floor(extract(epoch FROM clock_timestamp()))::int AS issued,
      floor(extract(epoch FROM LEAST(native.expires_at, entitlement.effective_until,
        clock_timestamp() + $2 * INTERVAL '1 second')))::int AS expires, handoff.editor_origin
      FROM page_studio_customer_editor_handoffs handoff
      JOIN page_studio_customer_sessions native ON native.token_hash = handoff.login_session_hash
      JOIN page_studio_sites site ON site.id = handoff.site_id
      JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
      WHERE handoff.id = $1`, [context.handoffId, CUSTOMER_EDITOR_MAX_SECONDS])).rows[0]
    if (!parent) throw denied()
    const claims = parseClaims({ role: 'customer', environment: 'staging', nonce: crypto.randomUUID(), userId: context.identityId,
      workspaceId: context.workspaceId, clientId: context.scope.clientId, siteId: context.scope.siteId, tenantId: context.scope.tenantId,
      issuedAt: parent.issued, expiresAt: parent.expires, capabilities: [...CustomerEditorCapabilitySchema.options],
      editorOrigin: parent.editor_origin, returnUrl: context.returnUrl })
    await db.query(`INSERT INTO page_studio_customer_editor_sessions (nonce, handoff_id, claims, issued_at, expires_at)
      VALUES ($1, $2, $3::jsonb, to_timestamp($4), to_timestamp($5))`,
    [claims.nonce, context.handoffId, JSON.stringify(claims), claims.issuedAt, claims.expiresAt])
    const token = await sign(claims)
    await assertCustomerEditorSessionAuthority(claims, 'workspace:create', db)
    await db.query(`INSERT INTO page_studio_audit_events
      (tenant_id, client_id, site_id, actor_id, actor_role, action, resource_type, resource_id)
      VALUES ($1, $2, $3, $4, 'customer', 'customer.session_issued', 'customer_editor_session', $5)`,
    [claims.tenantId, claims.clientId, claims.siteId, claims.userId, claims.nonce])
    return { token, sessionId: claims.nonce, expiresAt: claims.expiresAt, returnUrl: claims.returnUrl }
  })
}

/** Metadata boundary for a trusted typed editor; never a raw browser write route. */
export async function commitCustomerEditorCheckpoint(input: unknown, tokenClaims: unknown, dependencies: Dependencies & { env?: Record<string, unknown> } = {}) {
  const parsed = PageStudioCheckpointCommitSchema.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid customer draft checkpoint.' })
  const claims = parseClaims(tokenClaims)
  const { checkpoint } = parsed.data
  if (checkpoint.userId !== claims.userId || checkpoint.scope.siteId !== claims.siteId
    || checkpoint.scope.clientId !== claims.clientId || checkpoint.scope.tenantId !== claims.tenantId) throw denied()
  // Discover management under native authority, then release locks before storage I/O.
  const managed = await (dependencies.runTransaction ?? transaction)(async (db) => {
    await assertCustomerEditorSessionAuthority(claims, 'workspace:checkpoint', db)
    return (await db.query(`SELECT scope_key FROM page_studio_cms_scopes
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND state<>'legacy' LIMIT 1`,
    [claims.tenantId, claims.clientId, claims.siteId])).rows.length > 0
  })
  if (managed) {
    if (dependencies.env?.PAGE_STUDIO_CONTENT_ENVIRONMENT !== 'staging')
      throw createError({ statusCode: 409, statusMessage: 'Customer CMS authoring is not configured.' })
    const { coordinateCmsGraphCheckpoint } = await import('./cmsGraphCoordinator')
    const receipt = await coordinateCmsGraphCheckpoint(parsed.data, { source: 'customer-session', claims,
      env: dependencies.env, capability: 'workspace:checkpoint' }, dependencies)
    return { acknowledged: receipt.acknowledged, checkpointId: receipt.checkpointId,
      currentCheckpointId: receipt.currentCheckpointId, isCurrent: receipt.isCurrent }
  }
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const authority = await assertCustomerEditorSessionAuthority(claims, 'workspace:checkpoint', db)
    return commitPageStudioCheckpoint(parsed.data, { runTransaction: callback => callback(db),
      authorize: async (client) => { await assertCustomerEditorSessionAuthority(claims, 'workspace:checkpoint', client) },
      customerEditor: { sessionId: claims.nonce, userId: claims.userId, workspaceId: claims.workspaceId, handoffId: authority.handoffId } })
  })
}
export async function readCustomerEditorCheckpoint(input: unknown, dependencies: Dependencies = {}) {
  const claims = parseClaims(input)
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    await assertCustomerEditorSessionAuthority(claims, 'workspace:reconnect', db)
    const checkpoint = await getLatestPageStudioCheckpoint(claims, { queryOne: async <T>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows[0] ?? null })
    await assertCustomerEditorSessionAuthority(claims, 'workspace:reconnect', db)
    return checkpoint
  })
}
