import { createError } from 'h3'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { requireCustomerInspectionAuthority } from '~~/shared/pageStudio/customerInspectionAuthority'
import { withCustomerProductionAuthoringAuthority, type CustomerProductionAuthoringAuthority } from '~~/server/utils/pageStudio/customerAuthoringAuthority'
import { requireCustomerPlanOperator } from '~~/server/utils/pageStudio/customerPlanGrants'
import { withManagedTransferAuthority, type ManagedTransferAuthority } from '~~/server/utils/pageStudio/managedTransferAuthority'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import type { TransferControlsReviewSchema, TransferControlsOperatorSchema } from '~~/shared/pageStudio/transferControls'
import type { z } from 'zod'

export const denied = () => createError({ statusCode: 403, statusMessage: 'Current transfer access is required.' })
export const conflict = () => createError({ statusCode: 409, statusMessage: 'Refresh the saved transfer request before continuing.' })
export const equal = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
export const iso = (value: string | Date) => new Date(value).toISOString()
export type Operator = z.infer<typeof TransferControlsOperatorSchema>
export interface TransferRequestRow {
  request_id: string
  site_id: string
  entitlement_id: string
  owner_account_id: string
  owner_identity_id: string
  workspace_id: string
  owner_login_session_hash: string
  owner_proof: unknown
  operation_id: string
  revision: number
  state: 'requested' | 'reviewed' | 'approved' | 'reserving' | 'reserved' | 'revoked'
  expires_at: Date | string
  operator_id: string | null
  operator_login_session_hash: string | null
  operator_proof: unknown
  transfer_authority: ManagedTransferAuthority | null
  source_digest: string | null
  review: z.infer<typeof TransferControlsReviewSchema> | null
  review_revision: number | null
  approved_revision: number | null
  intent_digest: string | null
}
export const authorityInput = (row: TransferRequestRow, operator?: Operator) => ({ siteId: row.site_id,
  entitlementId: row.entitlement_id, ownerLoginSessionHash: row.owner_login_session_hash,
  operator: operator ?? { actorId: row.operator_id, loginSessionHash: row.operator_login_session_hash } })
export async function readRequest(db: PageStudioQueryClient, siteId: string, requestId: string, lock = false) {
  const row = (await db.query<TransferRequestRow>(`SELECT * FROM page_studio_transfer_requests
    WHERE site_id=$1 AND request_id=$2 ${lock ? 'FOR UPDATE NOWAIT' : ''}`, [siteId, requestId])).rows[0]
  if (!row) throw denied()
  return row
}
export function assertOperator(row: TransferRequestRow, operator: Operator) {
  if (row.operator_id !== operator.actorId || row.operator_login_session_hash !== operator.loginSessionHash) throw denied()
}
export function assertRevision(row: TransferRequestRow, revision: number) {
  if (row.revision !== revision) throw conflict()
}
export async function assertUnexpired(db: PageStudioQueryClient, row: TransferRequestRow) {
  if (!(await db.query('SELECT 1 WHERE $1::timestamptz>clock_timestamp()', [row.expires_at])).rows.length) throw conflict()
}
/** The same canonical entitlement timestamp fingerprint as full transfer admission.
 * This query captures metadata only; all owner admission stays in the established helper. */
export async function ownerProof(db: PageStudioQueryClient, hash: string, entitlementId: string, authority: CustomerProductionAuthoringAuthority) {
  const row = (await db.query<{ created_at: Date | string, expires_at: Date | string, owner_expires_at: Date | string, plan: unknown }>(`
    SELECT session.created_at, session.expires_at, LEAST(session.expires_at,membership.expires_at,entitlement.effective_until) AS owner_expires_at,
      (to_jsonb(entitlement) - ARRAY['created_at','updated_at','effective_from','effective_until'])
        || jsonb_build_object('created_at',extract(epoch FROM entitlement.created_at)::text,
          'updated_at',extract(epoch FROM entitlement.updated_at)::text,
          'effective_from',extract(epoch FROM entitlement.effective_from)::text,
          'effective_until',extract(epoch FROM entitlement.effective_until)::text) AS plan
    FROM page_studio_customer_sessions session CROSS JOIN page_studio_entitlements entitlement
    JOIN page_studio_workspace_memberships membership ON membership.workspace_id=$3 AND membership.identity_id=$4
    WHERE session.token_hash=$1 AND entitlement.id=$2
    FOR SHARE OF session,entitlement,membership NOWAIT`, [hash, entitlementId, authority.workspaceId, authority.identityId])).rows[0]
  if (!row) throw denied()
  return { authority: { ...authority, expiresAt: iso(row.owner_expires_at) }, createdAt: iso(row.created_at), expiresAt: iso(row.expires_at), entitlementDigest: await collectionDigest(row.plan) }
}
export async function operatorProof(db: PageStudioQueryClient, operator: Operator) {
  await requireCustomerPlanOperator(db, operator.actorId)
  const rows = (await db.query<{ issued_at: Date | string, expires_at: Date | string }>(`
    SELECT login.issued_at,login.expires_at FROM page_studio_login_sessions login
    JOIN team_members staff ON staff.id::text=login.user_id
    WHERE login.role='agency' AND login.token_hash=$1 AND staff.id=$2
      AND login.revoked_at IS NULL AND login.issued_at<=clock_timestamp() AND login.expires_at>clock_timestamp()
      AND staff.is_active=TRUE AND staff.user_role IN ('owner','admin')
      AND (staff.sessions_invalidated_at IS NULL OR login.issued_at>staff.sessions_invalidated_at)
    FOR SHARE OF login,staff NOWAIT`, [operator.loginSessionHash, operator.actorId])).rows
  if (rows.length !== 1) throw denied()
  return { issuedAt: iso(rows[0]!.issued_at), expiresAt: iso(rows[0]!.expires_at) }
}
/** Current native account read admission, independent of publishing entitlement.
 * It may inspect old requests but cannot supply replacement credentials to them. */
export async function currentOwner(db: PageStudioQueryClient, siteId: string, hash: string) {
  const sessions = (await db.query<{ account_id: string, identity_id: string }>(`
    SELECT session.account_id,account.identity_id FROM page_studio_customer_sessions session
    JOIN page_studio_customer_accounts account ON account.id=session.account_id
    WHERE session.token_hash=$1 AND session.revoked_at IS NULL
      AND session.created_at<=clock_timestamp() AND session.expires_at>clock_timestamp()
    FOR SHARE OF session,account NOWAIT`, [hash])).rows
  if (sessions.length !== 1) throw denied()
  const session = sessions[0]!
  const scope = await requireCustomerInspectionAuthority(db, { actorId: session.identity_id, accountId: session.account_id, siteId })
  if ((await db.query(`SELECT 1 FROM page_studio_workspace_memberships WHERE workspace_id=$1
    AND identity_id=$2 AND role='owner' AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE NOWAIT`, [scope.workspaceId, session.identity_id])).rows.length !== 1) throw denied()
  return { accountId: session.account_id, identityId: session.identity_id, workspaceId: scope.workspaceId }
}
export function assertOwnerIdentity(row: TransferRequestRow, owner: Awaited<ReturnType<typeof currentOwner>>) {
  if (row.owner_account_id !== owner.accountId || row.owner_identity_id !== owner.identityId || row.workspace_id !== owner.workspaceId) throw denied()
}
export async function withOwnerMetadata<T>(siteId: string, hash: string,
  work: (db: PageStudioQueryClient, authority: CustomerProductionAuthoringAuthority, proof: unknown) => Promise<T>,
  run: RunPageStudioTransaction): Promise<T> {
  return run(async (db) => {
    const site = (await db.query<{ entitlement_id: string }>('SELECT entitlement_id FROM page_studio_sites WHERE id=$1', [siteId])).rows[0]
    if (!site) throw denied()
    // SQL request metadata only. Review, approval and reserve use full transfer admission.
    return withCustomerProductionAuthoringAuthority({ siteId, loginSessionHash: hash, entitlementId: site.entitlement_id }, async (tx, authority) => {
      const proof = await ownerProof(tx, hash, site.entitlement_id, authority)
      const result = await work(tx, structuredClone(authority), structuredClone(proof))
      if (!equal(proof, await ownerProof(tx, hash, site.entitlement_id, authority))) throw conflict()
      return result
    }, { runTransaction: work => work(db) })
  })
}
/** Reconstruct owner snapshot from independently verified full authority; no
 * nesting of owner/site admission after operator/site locks. */
export async function assertRetainedAuthority(db: PageStudioQueryClient, row: TransferRequestRow,
  authority: ManagedTransferAuthority, operator: Operator, requireReview = true) {
  // Owner's own expiry is distinct from the minimum owner/operator review expiry.
  const stored = row.owner_proof as Awaited<ReturnType<typeof ownerProof>>
  const owner: CustomerProductionAuthoringAuthority = { ...authority.owner, entitlementId: authority.entitlementId,
    expiresAt: stored.authority.expiresAt, scope: authority.destination }
  const proof = await ownerProof(db, row.owner_login_session_hash, row.entitlement_id, owner)
  if (!equal(row.owner_proof, proof)) throw conflict()
  if (requireReview && (!equal(row.transfer_authority, authority) || !equal(row.operator_proof, await operatorProof(db, operator)))) throw conflict()
  if (authority.expiresAt > iso(row.expires_at)) throw conflict()
}
export async function withRequestAuthority<T>(snapshot: TransferRequestRow, operator: Operator,
  work: (db: PageStudioQueryClient, row: TransferRequestRow, authority: ManagedTransferAuthority) => Promise<T>,
  run: RunPageStudioTransaction, requireReview = true): Promise<T> {
  return withManagedTransferAuthority(authorityInput(snapshot, operator), async (db, authority) => {
    const row = await readRequest(db, snapshot.site_id, snapshot.request_id, true)
    if (requireReview) assertOperator(row, operator)
    else if (row.operator_id) assertOperator(row, operator)
    await assertUnexpired(db, row)
    await assertRetainedAuthority(db, row, authority, operator, requireReview)
    const result = await work(db, row, structuredClone(authority))
    await assertRetainedAuthority(db, row, authority, operator, requireReview)
    return result
  }, { runTransaction: run })
}
