import { createError } from 'h3'
import { readCustomerAdoptionAuthority } from './customerAdoptionAuthority'
import { CustomerEditorClaimsSchema, CustomerEditorCapabilitySchema, CUSTOMER_CMS_SETUP_MAX_SECONDS, customerSessionHasPurpose } from './customerEditorToken'
import { readCustomerEditorAuthority, type CustomerEditorAuthorityReceipt } from './customerEditorAuthority'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'

const denied = () => createError({ statusCode: 403, statusMessage: 'Customer editor access is not available.' })
export interface AuthorityReceipt extends CustomerEditorAuthorityReceipt {
  purpose: 'editor' | 'cms-setup' | 'cms-adoption'
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
  if (!receipt || receipt.environment !== claims.environment || receipt.identity_id !== claims.userId || receipt.workspace_id !== claims.workspaceId
    || receipt.site_id !== claims.siteId || receipt.business_id !== claims.clientId || receipt.tenant_id !== claims.tenantId
    || receipt.editor_origin !== claims.editorOrigin || `${receipt.dashboard_origin}/studio/dashboard` !== claims.returnUrl) throw denied()
  if (!customerSessionHasPurpose(claims.capabilities, receipt.purpose)
    || (receipt.purpose !== 'editor' && claims.expiresAt - claims.issuedAt > CUSTOMER_CMS_SETUP_MAX_SECONDS)) throw denied()
  const { identityId, owned } = await readCustomerEditorAuthority(db, receipt)
  if (identityId !== claims.userId || owned.workspaceId !== claims.workspaceId || owned.scope.businessId !== claims.clientId || owned.scope.tenantId !== claims.tenantId) throw denied()
  // Lock child last. Recheck time-based parent/membership authority after any wait.
  const child = (await db.query(`SELECT nonce FROM page_studio_customer_editor_sessions
    WHERE nonce = $1 AND claims = $2::jsonb AND revoked_at IS NULL AND expires_at > clock_timestamp() FOR SHARE`, args)).rows[0]
  if (!child) throw denied()
  await readCustomerEditorAuthority(db, receipt)
  const active = (await db.query(`SELECT nonce FROM page_studio_customer_editor_sessions
    WHERE nonce = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()`, [claims.nonce])).rows[0]
  if (!active) throw denied()
  if (receipt.purpose === 'cms-adoption') await readCustomerAdoptionAuthority(db, receipt, claims.nonce)
  return { claims, handoffId: receipt.handoff_id, owned }
}

export { parseClaims as parseCustomerEditorClaims }
