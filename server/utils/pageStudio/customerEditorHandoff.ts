import { z } from 'zod'
import { CustomerEditorOriginSchema as Origin } from './customerEditorToken'
import { createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import { digestPortalSessionToken, generatePortalMagicLinkToken } from '~~/server/utils/portalSession'
import { readCustomerSession, readCustomerSetup } from './customerSignup'
import { readCustomerProvisioningPreviewAuthority, readCustomerSessionIdentityFromHash } from './customerProvisioning'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

const Configuration = z.object({ enabled: z.literal(true), dashboardOrigin: Origin, editorOrigin: Origin }).strict()
  .refine(value => value.dashboardOrigin !== value.editorOrigin)
const Token = z.string().regex(/^[A-Za-z0-9_-]{64}$/)
const denied = () => createError({ statusCode: 403, statusMessage: 'Customer editor handoff is not available.' })
interface Dependencies { runTransaction?: RunPageStudioTransaction }
interface Receipt {
  id: string
  token_hash: string
  login_session_hash: string
  identity_id: string
  workspace_id: string
  site_id: string
  tenant_id: string
  business_id: string
  dashboard_origin: string
  editor_origin: string
  expires_at: Date
}
export function parseCustomerEditorHandoffConfiguration(value: unknown) {
  const parsed = Configuration.safeParse(value)
  if (!parsed.success) throw denied()
  return parsed.data
}
async function audit(db: PageStudioQueryClient, receipt: Receipt, action: string) {
  await db.query(`INSERT INTO page_studio_audit_events
    (tenant_id, client_id, site_id, actor_id, actor_role, action, resource_type, resource_id)
    VALUES ($1, $2, $3, $4, 'customer', $5, 'customer_editor_handoff', $6)`,
  [receipt.tenant_id, receipt.business_id, receipt.site_id, receipt.identity_id, action, receipt.id])
}

/** Internal only. A transport ticket is NOT a Studio JWT, editor permission or Ready receipt.
 * Future HTTP producer must enforce exact origin/rate limit and readiness before calling. */
export async function issueCustomerEditorHandoff(sessionToken: unknown, trustedConfiguration: unknown, dependencies: Dependencies = {}) {
  const config = parseCustomerEditorHandoffConfiguration(trustedConfiguration)
  if (!Token.safeParse(sessionToken).success) throw denied()
  const token = generatePortalMagicLinkToken()
  const tokenHash = await digestPortalSessionToken(token)
  const loginHash = await digestPortalSessionToken(sessionToken as string)
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const run: RunPageStudioTransaction = callback => callback(db)
    const user = await readCustomerSession(sessionToken, run)
    const setup = await readCustomerSetup(sessionToken, run)
    if (!setup.workspaceId) throw denied()
    const site = (await db.query<{ site_id: string }>('SELECT site_id FROM page_studio_customer_site_requests WHERE workspace_id = $1', [setup.workspaceId])).rows[0]
    if (!site) throw denied()
    const owned = await readCustomerProvisioningPreviewAuthority(db, site.site_id, user.identityId)
    if (owned.workspaceId !== setup.workspaceId) throw denied()
    // Site/entitlement acquisition may wait beyond membership expiry. Recheck
    // with all authority locks held before recording a successful issuance.
    await readCustomerProvisioningPreviewAuthority(db, site.site_id, user.identityId)
    // Use one database-clock value and clamp the ticket to both native authority deadlines.
    const receipt = (await db.query<Receipt>(`WITH clock AS (SELECT clock_timestamp() AS issued)
      INSERT INTO page_studio_customer_editor_handoffs
        (token_hash, login_session_hash, identity_id, workspace_id, site_id, tenant_id, business_id,
         dashboard_origin, editor_origin, issued_at, expires_at)
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, clock.issued,
        LEAST(clock.issued + INTERVAL '2 minutes', session.expires_at, $10::timestamptz)
      FROM page_studio_customer_sessions session CROSS JOIN clock
      WHERE session.token_hash = $2 AND session.revoked_at IS NULL AND session.expires_at > clock.issued
        AND $10::timestamptz > clock.issued
      RETURNING *`, [tokenHash, loginHash, user.identityId, owned.workspaceId, owned.site.id, owned.scope.tenantId,
      owned.scope.businessId, config.dashboardOrigin, config.editorOrigin, owned.policy.expiresAt])).rows[0]
    if (!receipt) throw denied()
    await audit(db, receipt, 'customer.handoff_issued')
    return { token, expiresAt: new Date(receipt.expires_at).toISOString(), editorOrigin: config.editorOrigin }
  })
}

/** For an authenticated private Studio adapter only. Origins are trusted server config,
 * not proof of caller identity. Returned context cannot authorize editing or publication. */
export async function redeemCustomerEditorHandoff(token: unknown, trustedConfiguration: unknown, dependencies: Dependencies = {}) {
  const config = parseCustomerEditorHandoffConfiguration(trustedConfiguration)
  if (!Token.safeParse(token).success) throw denied()
  const hash = await digestPortalSessionToken(token as string)
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    // Read immutable routing data first; acquire native authority locks before the ticket lock.
    const receipt = (await db.query<Receipt>(`SELECT * FROM page_studio_customer_editor_handoffs
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > clock_timestamp()
        AND dashboard_origin = $2 AND editor_origin = $3`, [hash, config.dashboardOrigin, config.editorOrigin])).rows[0]
    if (!receipt) throw denied()
    const identityId = await readCustomerSessionIdentityFromHash(db, receipt.login_session_hash)
    if (identityId !== receipt.identity_id) throw denied()
    const owned = await readCustomerProvisioningPreviewAuthority(db, receipt.site_id, identityId)
    if (owned.workspaceId !== receipt.workspace_id || owned.scope.businessId !== receipt.business_id
      || owned.scope.tenantId !== receipt.tenant_id) throw denied()
    // A lock wait must not extend membership/native/package deadlines. Lock the
    // ticket last, then recheck the already-locked authority with a fresh clock.
    await db.query('SELECT id FROM page_studio_customer_editor_handoffs WHERE token_hash = $1 FOR UPDATE', [hash])
    await readCustomerSessionIdentityFromHash(db, receipt.login_session_hash)
    await readCustomerProvisioningPreviewAuthority(db, receipt.site_id, identityId)
    const consumed = (await db.query(`UPDATE page_studio_customer_editor_handoffs SET consumed_at = clock_timestamp()
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > clock_timestamp() RETURNING id`, [hash])).rows[0]
    if (!consumed) throw denied()
    await audit(db, receipt, 'customer.handoff_consumed')
    return { kind: 'customer-editor-handoff' as const, handoffId: receipt.id, identityId, workspaceId: owned.workspaceId,
      scope: owned.scope, returnUrl: `${config.dashboardOrigin}/studio/dashboard` }
  })
}
