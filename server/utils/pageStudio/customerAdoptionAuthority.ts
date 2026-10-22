import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  CustomerAdoptionGrantReferenceSchema,
  CustomerAdoptionSourceSchema
} from '~~/shared/pageStudio/customerAdoptionGrant'
import { CmsAdoptionIntentSchema } from '~~/shared/pageStudio/cmsManaged'
import { readCustomerSessionIdentityFromHash } from './customerProvisioning'
import {
  adoptionDenied,
  adoptionEqual,
  readCustomerAdoptionContext,
  assertCustomerAdoptionClock
} from './customerAdoptionContext'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'

/** Exact linked parent, never a latest-grant fallback. The old preview records
 * remain immutable historical source identity, not present capacity. */
export async function readCustomerAdoptionAuthority(
  db: PageStudioQueryClient,
  receipt: {
    site_id: string
    login_session_hash: string
    adoption_grant_id?: string | null
    adoption_grant_revision?: number | null
  },
  childNonce?: string
) {
  const reference = CustomerAdoptionGrantReferenceSchema.safeParse({
    grantId: receipt.adoption_grant_id,
    revision: receipt.adoption_grant_revision
  })
  if (!reference.success) throw adoptionDenied()
  const grant = (
    await db.query<{
      operator_id: string
      operator_login_hash: string
      source: unknown
      source_digest: string
      expires_at: Date
    }>(
      `
    SELECT operator_id,operator_login_hash,source,source_digest,expires_at FROM page_studio_customer_adoption_grants
    WHERE grant_id=$1 AND revision=$2 AND site_id=$3`,
      [reference.data.grantId, reference.data.revision, receipt.site_id]
    )
  ).rows[0]
  if (!grant) throw adoptionDenied()
  const identityId = await readCustomerSessionIdentityFromHash(db, receipt.login_session_hash)
  const source = CustomerAdoptionSourceSchema.parse(grant.source),
    operator = { actorId: grant.operator_id, loginSessionHash: grant.operator_login_hash }
  if (source.owner.identityId !== identityId || (await collectionDigest(source)) !== grant.source_digest)
    throw adoptionDenied()
  const current = await readCustomerAdoptionContext(db, receipt.site_id, operator, false)
  const { storage, ...expected } = source
  if (!adoptionEqual(current.source, expected)) throw adoptionDenied()
  if (
    !(
      await db.query(
        `SELECT 1 FROM page_studio_customer_adoption_grants grant_row
    JOIN page_studio_customer_adoption_selections selection ON selection.grant_id=grant_row.grant_id AND selection.site_id=grant_row.site_id AND selection.revision=grant_row.revision
    WHERE grant_row.grant_id=$1 AND grant_row.revision=$2 AND grant_row.site_id=$3 AND grant_row.enabled=TRUE
      AND grant_row.issued_at<=clock_timestamp() AND grant_row.expires_at>clock_timestamp()
    FOR SHARE OF grant_row,selection NOWAIT`,
        [reference.data.grantId, reference.data.revision, receipt.site_id]
      )
    ).rows.length
  )
    throw adoptionDenied()
  if (current.adoption) {
    const row = current.adoption,
      intent = CmsAdoptionIntentSchema.parse(row.adoption_request)
    if (
      (await collectionDigest(intent)) !== row.adoption_digest ||
      intent.adoptionId !== row.adoption_id ||
      (row.pending_generation ?? row.active_generation) !== intent.generation ||
      !adoptionEqual(intent.scope, source.scope) ||
      !adoptionEqual(intent.target, storage.selection.target) ||
      !adoptionEqual(row.target, intent.target) ||
      !adoptionEqual(intent.expectedCheckpoint, { id: source.checkpoint.id, digest: source.checkpoint.digest }) ||
      intent.actor.kind !== 'customer-user' ||
      intent.actor.userId !== identityId
    )
      throw adoptionDenied()
    // This parent was issued only when adoption was absent. The immutable
    // intent must therefore originate from one of its genuine linked children.
    if (
      !(
        await db.query(
          `SELECT 1 FROM page_studio_customer_editor_handoffs h JOIN page_studio_customer_editor_sessions child ON child.handoff_id=h.id
      WHERE h.adoption_grant_id=$1 AND h.adoption_grant_revision=$2 AND h.site_id=$3 AND h.identity_id=$4
        AND h.login_session_hash=$5 AND h.purpose='cms-adoption' AND h.consumed_at IS NOT NULL`,
          [reference.data.grantId, reference.data.revision, receipt.site_id, identityId, intent.actor.loginSessionHash]
        )
      ).rows.length
    )
      throw adoptionDenied()
  }
  await assertCustomerAdoptionClock(db, receipt.site_id, operator)
  // One final database clock covers owner login, operator login, membership and
  // the already locked parent. Never extend a child while waiting on a lock.
  if (
    !(
      await db.query(
        `SELECT 1 FROM page_studio_customer_sessions owner_login
    CROSS JOIN page_studio_login_sessions operator_login CROSS JOIN page_studio_customer_adoption_grants grant_row
    JOIN page_studio_workspace_memberships membership ON membership.workspace_id=grant_row.workspace_id AND membership.identity_id=grant_row.identity_id
    WHERE owner_login.token_hash=$1 AND owner_login.expires_at>clock_timestamp() AND owner_login.revoked_at IS NULL
      AND operator_login.token_hash=$2 AND operator_login.role='agency' AND operator_login.expires_at>clock_timestamp() AND operator_login.revoked_at IS NULL
      AND grant_row.grant_id=$3 AND grant_row.enabled AND grant_row.expires_at>clock_timestamp()
      AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
      AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM page_studio_customer_editor_sessions child
        WHERE child.nonce=$4 AND child.revoked_at IS NULL AND child.expires_at>clock_timestamp()))`,
        [receipt.login_session_hash, operator.loginSessionHash, reference.data.grantId, childNonce ?? null]
      )
    ).rows.length
  )
    throw adoptionDenied()
  return {
    identityId,
    expiresAt: grant.expires_at.toISOString(),
    owned: { workspaceId: source.owner.workspaceId, scope: source.scope }
  }
}
