import { readNativeCustomerEditorCheckpoint } from './customerEditorCheckpointRead'
import { createError, type H3Event } from 'h3'
import { transaction } from '~~/server/utils/db'
import { redeemCustomerEditorHandoff } from './customerEditorHandoff'
import { readCustomerEditorAuthority } from './customerEditorAuthority'
import { CUSTOMER_EDITOR_MAX_SECONDS, CUSTOMER_CMS_SETUP_MAX_SECONDS, customerSessionCapabilities, signCustomerEditorToken,
  type CustomerEditorClaims } from './customerEditorToken'
import { assertSoleCmsAuthoringScope } from './cmsGraphCoordinator'
import { lockCmsContext, cmsEqual } from './cmsVisibility'
import { withVerifiedCustomerEditorStorage } from './customerEditorStorage'
import { resolvePageStudioSessionEnvironment } from './sessions'
import { PageStudioCheckpointCommitSchema } from './controlSchemas'
import { commitPageStudioCheckpoint, getLatestPageStudioCheckpoint } from './controlStore'
import type { RunPageStudioTransaction } from './sites'
import { assertCustomerEditorSessionAuthority, parseCustomerEditorClaims as parseClaims, type AuthorityReceipt } from './customerEditorSessionAuthority'

const denied = () => createError({ statusCode: 403, statusMessage: 'Customer editor access is not available.' })
interface Dependencies { runTransaction?: RunPageStudioTransaction, assertWorkspace?: (workspaceId: string) => void }
export { assertCustomerEditorSessionAuthority } from './customerEditorSessionAuthority'

/** Consume, persist and sign atomically. A failed exchange can retry the SAME ticket. */
export async function exchangeCustomerEditorSession(ticket: unknown, configuration: unknown, dependencies: Dependencies & {
  event?: H3Event
  signToken?: (claims: CustomerEditorClaims) => Promise<string>
} = {}) {
  const environment = dependencies.signToken ? null : resolvePageStudioSessionEnvironment(dependencies.event)
  const sign = dependencies.signToken ?? (claims => signCustomerEditorToken(claims, environment!.privateKey, environment!.issuer))
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const context = await redeemCustomerEditorHandoff(ticket, configuration, { runTransaction: callback => callback(db), assertWorkspace: dependencies.assertWorkspace })
    const handoff = (await db.query<AuthorityReceipt>('SELECT * FROM page_studio_customer_editor_handoffs WHERE id=$1', [context.handoffId])).rows[0]
    const capabilities = customerSessionCapabilities(handoff?.purpose)
    const setup = handoff?.purpose === 'cms-setup'
    if (!handoff) throw denied()
    const authority = await readCustomerEditorAuthority(db, handoff)
    // Use one instant for both bounds: separate clock reads can cross a second
    // and create an overlong session that our own authority checks reject.
    const parent = (await db.query<{ issued: number, expires: number, editor_origin: string }>(`WITH issuance AS MATERIALIZED (SELECT clock_timestamp() AS instant)
      SELECT floor(extract(epoch FROM issuance.instant))::int AS issued,
      floor(extract(epoch FROM LEAST(native.expires_at, entitlement.effective_until, $3::timestamptz,
        issuance.instant + $2 * INTERVAL '1 second')))::int AS expires, handoff.editor_origin
      FROM page_studio_customer_editor_handoffs handoff
      CROSS JOIN issuance
      JOIN page_studio_customer_sessions native ON native.token_hash = handoff.login_session_hash
      JOIN page_studio_sites site ON site.id = handoff.site_id
      JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
      WHERE handoff.id = $1`, [context.handoffId, setup ? CUSTOMER_CMS_SETUP_MAX_SECONDS : CUSTOMER_EDITOR_MAX_SECONDS, authority.expiresAt])).rows[0]
    if (!parent) throw denied()
    const claims = parseClaims({ role: 'customer', environment: context.scope.environment, nonce: crypto.randomUUID(), userId: context.identityId,
      workspaceId: context.workspaceId, clientId: context.scope.clientId, siteId: context.scope.siteId, tenantId: context.scope.tenantId,
      issuedAt: parent.issued, expiresAt: parent.expires, capabilities,
      editorOrigin: parent.editor_origin, returnUrl: context.returnUrl })
    await db.query(`INSERT INTO page_studio_customer_editor_sessions (nonce, handoff_id, claims, issued_at, expires_at)
      VALUES ($1, $2, $3::jsonb, to_timestamp($4), to_timestamp($5))`,
    [claims.nonce, context.handoffId, JSON.stringify(claims), claims.issuedAt, claims.expiresAt])
    const token = await sign(claims)
    await assertCustomerEditorSessionAuthority(claims, setup ? 'cms:prepare' : 'workspace:create', db)
    await db.query(`INSERT INTO page_studio_audit_events
      (tenant_id, client_id, site_id, actor_id, actor_role, action, resource_type, resource_id)
      VALUES ($1, $2, $3, $4, 'customer', 'customer.session_issued', 'customer_editor_session', $5)`,
    [claims.tenantId, claims.clientId, claims.siteId, claims.userId, claims.nonce])
    dependencies.assertWorkspace?.(claims.workspaceId)
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
    dependencies.assertWorkspace?.(claims.workspaceId)
    return (await db.query(`SELECT scope_key FROM page_studio_cms_scopes
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND state<>'legacy' LIMIT 1`,
    [claims.tenantId, claims.clientId, claims.siteId])).rows.length > 0
  })
  if (managed) {
    if (dependencies.env?.PAGE_STUDIO_CONTENT_ENVIRONMENT !== claims.environment)
      throw createError({ statusCode: 409, statusMessage: 'Customer CMS authoring is not configured.' })
    const { coordinateCmsGraphCheckpoint } = await import('./cmsGraphCoordinator')
    const receipt = await coordinateCmsGraphCheckpoint(parsed.data, { source: 'customer-session', claims,
      env: dependencies.env, capability: 'workspace:checkpoint' }, dependencies)
    dependencies.assertWorkspace?.(claims.workspaceId)
    return { acknowledged: receipt.acknowledged, checkpointId: receipt.checkpointId,
      currentCheckpointId: receipt.currentCheckpointId, isCurrent: receipt.isCurrent }
  }
  if (claims.environment === 'production') throw denied()
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const authority = await assertCustomerEditorSessionAuthority(claims, 'workspace:checkpoint', db)
    return commitPageStudioCheckpoint(parsed.data, { runTransaction: callback => callback(db),
      authorize: async (client) => { await assertCustomerEditorSessionAuthority(claims, 'workspace:checkpoint', client) },
      customerEditor: { sessionId: claims.nonce, userId: claims.userId, workspaceId: claims.workspaceId, handoffId: authority.handoffId } })
  })
}
export async function readCustomerEditorCheckpoint(input: unknown, dependencies: Dependencies & { env?: Record<string, unknown> } = {}) {
  const claims = parseClaims(input)
  if (claims.environment === 'production') {
    if (dependencies.env?.PAGE_STUDIO_CONTENT_ENVIRONMENT !== claims.environment) throw denied()
    return withVerifiedCustomerEditorStorage(async (db) => {
      const { owned } = await assertCustomerEditorSessionAuthority(claims, 'workspace:reconnect', db)
      const scope = owned.scope
      await assertSoleCmsAuthoringScope(db, scope)
      const context = await lockCmsContext(db, scope)
      const latest = await getLatestPageStudioCheckpoint(claims, { queryOne: async <T>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows[0] ?? null })
      if (!latest || !cmsEqual({ id: latest.checkpointId, digest: latest.digest }, context.application.manifest.checkpoint)) throw denied()
      await assertCustomerEditorSessionAuthority(claims, 'workspace:reconnect', db)
      dependencies.assertWorkspace?.(claims.workspaceId)
      return { scope, context, checkpoint: { id: latest.checkpointId, digest: latest.digest, object_key: latest.objectKey } }
    }, { env: dependencies.env, runTransaction: dependencies.runTransaction ?? transaction }, async (_db, snapshot) => ({
      checkpointId: snapshot.checkpoint.id, digest: snapshot.checkpoint.digest, objectKey: snapshot.checkpoint.object_key
    }))
  }
  return readNativeCustomerEditorCheckpoint(claims, dependencies.runTransaction ?? transaction)
}
