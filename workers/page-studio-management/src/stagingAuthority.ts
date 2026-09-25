import { CheckpointStagingOriginSchema, CheckpointStagingRequestSchema } from '../../../shared/pageStudio/checkpointStagingOrigin'
import { pageStudioAuthorityOwnerJoin, pageStudioEditorEntitlementJoin } from '../../../server/utils/pageStudio/authoritySql'
import { DomainManagementActorSchema, type DomainManagementActor } from '../../../shared/pageStudio/domainManagement'
import type { DomainDatabase } from './domainAttachment'
import { agencyAuthority } from './domainManagement'
import { StagingStoreError } from './stagingStore'

/** Fresh native permissions; the platform preview never consumes domain quota. */
export async function requireStagingAuthority(db: DomainDatabase, rawActor: DomainManagementActor, siteId: string, writing: boolean) {
  const actor = DomainManagementActorSchema.parse(rawActor)
  const denied = () => new StagingStoreError('STAGING_ACCESS_DENIED', 403)
  let canManage = false
  if (actor.kind === 'agency') {
    try {
      canManage = await agencyAuthority(db, actor.actorId, 'PAGE_STUDIO_VIEW')
    } catch {
      throw denied()
    }
    if (writing && !canManage) throw denied()
  }
  const result = await db.query<{ tenantId: string, clientId: string, siteId: string, canManage: boolean }>(`SELECT site.tenant_id AS "tenantId",site.client_id::text AS "clientId",site.id::text AS "siteId",
    ${actor.kind === 'portal' ? `(portal_user.role IN ('admin','manager') AND membership.role='editor')` : '$4::boolean'} AS "canManage"
    FROM page_studio_sites site
    JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
    JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id AND entitlement.tenant_id=site.tenant_id
      AND entitlement.client_id=site.client_id AND entitlement.status IN ('trial','active')
      AND entitlement.effective_from<=clock_timestamp() AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
    ${actor.kind === 'portal'
      ? `JOIN client_users portal_user ON portal_user.id=$3 AND portal_user.client_id=site.client_id
      AND portal_user.status='active' AND portal_user.role IN ('admin','manager','viewer')
      JOIN page_studio_site_memberships membership ON membership.tenant_id=site.tenant_id AND membership.client_id=site.client_id
        AND membership.site_id=site.id AND membership.user_id=portal_user.id AND membership.role IN ('editor','viewer')`
      : ''}
    WHERE site.id=$1 AND ${actor.kind === 'portal' ? 'site.client_id=$2' : 'site.tenant_id=$2 AND $3::uuid IS NOT NULL'}
      AND site.status IN ('draft','active')
    FOR NO KEY UPDATE OF site FOR SHARE OF client,entitlement${actor.kind === 'portal' ? ',portal_user,membership' : ''}`,
  actor.kind === 'portal' ? [siteId, actor.clientId, actor.actorId] : [siteId, actor.tenantId, actor.actorId, canManage])
  const row = result.rows[0]
  if (result.rows.length !== 1 || !row || (writing && row.canManage !== true)) throw denied()
  return { scope: { tenantId: row.tenantId, clientId: row.clientId, siteId: row.siteId }, canManage: row.canManage }
}

/** SQL-only admission for a deferred checkpoint. Inputs name an immutable audit,
 * never an actor. The caller owns this transaction and must call again before
 * retaining provider results/activation; the returned origin is not a grant. */
export async function requireCheckpointStagingOrigin(db: DomainDatabase, raw: unknown, environment: unknown) {
  const decoded = CheckpointStagingRequestSchema.safeParse(raw)
  const deny = (): never => {
    throw new StagingStoreError('STAGING_ACCESS_DENIED', 403)
  }
  if (!decoded.success || !['staging', 'production'].includes(String(environment))
    || decoded.data.expectedEnvironment !== environment) return deny()
  const request = decoded.data
  const { scope } = request
  const params = [scope.tenantId, scope.clientId, scope.siteId]
  // This order matches checkpoint writers and allows logout's audit FK checks.
  const site = await db.query(`SELECT id FROM page_studio_sites
    WHERE tenant_id=$1 AND client_id=$2 AND id=$3 AND current_checkpoint_id=$4
    AND status IN ('draft','active') FOR NO KEY UPDATE`, [...params, request.checkpointId])
  if (site.rows.length !== 1) return deny()
  const rows = (await db.query<{ metadata: Record<string, unknown>, authorId: string, actorId: string, actorRole: string }>(`SELECT audit.metadata,
    checkpoint.author_id AS "authorId",audit.actor_id AS "actorId",audit.actor_role AS "actorRole"
    FROM page_studio_audit_events audit JOIN page_studio_checkpoints checkpoint
      ON checkpoint.tenant_id=audit.tenant_id AND checkpoint.client_id=audit.client_id
      AND checkpoint.site_id=audit.site_id AND checkpoint.id=audit.resource_id
    WHERE audit.tenant_id=$1 AND audit.client_id=$2 AND audit.site_id=$3 AND audit.id=$4
      AND audit.action='workspace.checkpointed' AND audit.resource_type='checkpoint'
      AND checkpoint.id=$5 AND checkpoint.digest=$6 FOR SHARE OF audit,checkpoint`,
  [...params, request.auditId, request.checkpointId, request.digest])).rows
  if (rows.length !== 1) return deny()
  const audit = rows[0]!
  if (!audit.metadata || typeof audit.metadata !== 'object' || Array.isArray(audit.metadata)) return deny()
  const parsed = CheckpointStagingOriginSchema.safeParse(audit.metadata.stagingOrigin)
  if (!parsed.success || parsed.data.environment !== environment || audit.authorId !== parsed.data.userId
    || audit.metadata.digest !== request.digest || !['cas-v1', 'cms-graph-v1'].includes(String(audit.metadata.commitProtocol))) return deny()
  const origin = parsed.data
  const producerMatches = audit.actorRole === 'service'
    ? audit.actorId === 'page-studio' && audit.metadata.authorId === origin.userId && audit.metadata.commitProtocol === 'cas-v1'
    : audit.actorId === origin.userId && audit.actorRole === origin.role
  if (!producerMatches || (origin.source === 'provisioning'
    && (origin.requestKey !== `page-studio-${scope.siteId}-${origin.proposalRevision}`
      || !/^setup_[a-f0-9]{64}$/.test(request.checkpointId) || audit.metadata.expectedCheckpointId !== null))) return deny()
  const agency = origin.role === 'agency'
  if (!agency && (await db.query(`SELECT token_hash FROM client_sessions WHERE token_hash=$1
    AND client_user_id=$2 AND expires_at>clock_timestamp() FOR SHARE`, [origin.loginSessionHash, origin.userId])).rows.length !== 1) return deny()
  if ((await db.query(`SELECT token_hash FROM page_studio_login_sessions WHERE role=$1 AND token_hash=$2 AND user_id=$3
    AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE`, [origin.role, origin.loginSessionHash, origin.userId])).rows.length !== 1) return deny()
  const actor: DomainManagementActor = agency
    ? { kind: 'agency', tenantId: scope.tenantId, actorId: origin.userId }
    : { kind: 'portal', clientId: scope.clientId, actorId: origin.userId }
  await requireStagingAuthority(db, actor, scope.siteId, true)
  // Re-evaluate expiry at statement time after all previous lock waits. Original
  // parent, child and proposal are exact identities; a newer login is irrelevant.
  const checkLocked = () => db.query(`SELECT login.token_hash FROM page_studio_login_sessions login
    JOIN page_studio_sites site ON site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3
      AND site.status IN ('draft','active') AND site.current_checkpoint_id=$7
    ${pageStudioEditorEntitlementJoin('clock_timestamp()')}
    ${pageStudioAuthorityOwnerJoin(agency, 'history', 'clock_timestamp()')}
    ${origin.source === 'studio-session'
      ? `JOIN page_studio_sessions session ON session.nonce=$8
      AND session.tenant_id=site.tenant_id AND session.client_id=site.client_id AND session.site_id=site.id
      AND session.user_id=login.user_id AND session.role=login.role AND session.login_session_hash=login.token_hash
      AND session.revoked_at IS NULL AND session.expires_at>clock_timestamp()
      AND session.capabilities ? 'workspace:checkpoint'`
      : ''}
    ${origin.source === 'provisioning'
      ? `JOIN page_studio_setup_proposals proposal ON proposal.tenant_id=site.tenant_id
      AND proposal.client_id=site.client_id AND proposal.site_id=site.id AND proposal.revision=$8 AND proposal.status='accepted'
      AND NOT EXISTS(SELECT 1 FROM page_studio_setup_proposals later WHERE later.tenant_id=site.tenant_id
        AND later.client_id=site.client_id AND later.site_id=site.id AND later.revision>proposal.revision)`
      : ''}
    WHERE login.role=$4 AND login.token_hash=$5 AND login.user_id=$6
      AND login.revoked_at IS NULL AND login.expires_at>clock_timestamp()
    FOR SHARE`, [...params, origin.role, origin.loginSessionHash, origin.userId,
    request.checkpointId, ...(origin.source === 'studio-session' ? [origin.nonce] : origin.source === 'provisioning' ? [origin.proposalRevision] : [])])
  if ((await checkLocked()).rows.length !== 1) return deny()
  // The first statement can wait on a child/permission/proposal row. All those
  // locks are now held; re-evaluate wall-clock expiry after the wait finishes.
  if ((await checkLocked()).rows.length !== 1) return deny()
  return { ...request, origin, actor }
}
