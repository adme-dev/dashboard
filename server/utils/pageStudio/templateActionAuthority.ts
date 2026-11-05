import { createError } from 'h3'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import type { PageStudioLoginSession } from './loginSessions'
import { templateCatalogueQuery, type TemplateActor } from './templateCatalogue'
import { resolveAgencyTemplateTenant } from './templateCatalogueAuthority'

export interface TemplateActionPrincipal { actor: TemplateActor, login?: PageStudioLoginSession }
export const templateDenied = () => createError({ statusCode: 403, statusMessage: 'Template access is unavailable.' })
/** Lock the original login and mutable membership/role, never a refreshed identity. */
export async function assertTemplateActor(db: PageStudioQueryClient, principal: TemplateActionPrincipal,
  env: Record<string, unknown>, write: boolean) {
  const actor = principal.actor
  if (actor.kind === 'agency') {
    const login = principal.login
    if (!login || login.userId !== actor.userId || login.role !== 'agency') throw templateDenied()
    if (await resolveAgencyTemplateTenant(env, async (sql, params) => (await db.query<{ tenant_id: string }>(sql.replace('LIMIT 1', 'LIMIT 1 FOR SHARE'), params)).rows) !== actor.tenantId) throw templateDenied()
    const rows = await db.query(`SELECT owner.id FROM page_studio_login_sessions login
      JOIN team_members owner ON owner.id::text=login.user_id AND owner.is_active=TRUE
        AND (owner.sessions_invalidated_at IS NULL OR login.issued_at>=owner.sessions_invalidated_at)
      JOIN custom_roles role ON ((owner.custom_role_id IS NOT NULL AND role.id=owner.custom_role_id)
        OR (owner.custom_role_id IS NULL AND role.slug=owner.user_role::text AND role.is_system=TRUE))
      JOIN role_permission_groups permission ON permission.role_id=role.id AND permission.permission_group=$5
      WHERE login.role='agency' AND login.token_hash=$1 AND login.user_id=$2 AND login.issued_at=$3::timestamptz
        AND login.expires_at=$4::timestamptz AND login.revoked_at IS NULL AND login.issued_at<=clock_timestamp()
        AND login.expires_at>clock_timestamp() ${write ? "AND role.is_read_only=FALSE AND owner.user_role NOT IN ('viewer','guest')" : ''}
      FOR SHARE OF login,owner,role,permission`, [login.tokenHash, actor.userId, login.issuedAt.toISOString(), login.expiresAt.toISOString(), write ? 'PAGE_STUDIO_EDIT' : 'PAGE_STUDIO_VIEW'])
    if (rows.rows.length !== 1) throw templateDenied()
  } else if (actor.kind === 'portal') {
    const rows = await db.query(`SELECT usr.id FROM client_sessions session JOIN client_users usr ON usr.id=session.client_user_id
      JOIN agency_clients client ON client.id=usr.client_id WHERE session.token_hash=$1 AND usr.id=$2
        AND usr.client_id=$3 AND session.expires_at>clock_timestamp() AND usr.status='active' AND client.is_active=TRUE
        ${write ? "AND usr.role IN ('admin','manager')" : ''} FOR SHARE OF session,usr,client`, [actor.sessionIdentity, actor.userId, actor.clientId])
    if (rows.rows.length !== 1) throw templateDenied()
  } else {
    const rows = await db.query(`SELECT identity.id FROM page_studio_customer_sessions session
      JOIN page_studio_customer_accounts account ON account.id=session.account_id
      JOIN page_studio_customer_identities identity ON identity.id=account.identity_id
      JOIN page_studio_workspace_memberships member ON member.identity_id=identity.id
      JOIN page_studio_customer_workspaces workspace ON workspace.id=member.workspace_id
      WHERE session.token_hash=$1 AND identity.id=$2 AND workspace.id=$3
        AND session.revoked_at IS NULL AND session.expires_at>clock_timestamp() AND session.created_at<=clock_timestamp()
        AND account.status='active' AND identity.status='active' AND identity.issuer='studio'
        AND identity.subject=account.id::text AND identity.portal_user_id IS NULL AND identity.verified_at<=clock_timestamp()
        AND workspace.status='active' AND member.revoked_at IS NULL
        AND (member.expires_at IS NULL OR member.expires_at>clock_timestamp())
        AND member.role IN (${write ? "'owner'" : "'owner','manager','editor','viewer'"})
        AND NOT EXISTS(SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id=workspace.id)
      FOR SHARE OF session,account,identity,member,workspace`, [actor.sessionIdentity, actor.identityId, actor.workspaceId])
    if (rows.rows.length !== 1) throw templateDenied()
  }
}
export async function requireSelectedTemplate(db: PageStudioQueryClient, principal: TemplateActionPrincipal, versionId: string,
  env: Record<string, unknown>, write = false) {
  await assertTemplateActor(db, principal, env, write)
  const locked = (await db.query<{ template_id: string }>(`SELECT version.template_id FROM page_studio_template_versions version
    JOIN page_studio_template_entries entry ON entry.id=version.template_id
    JOIN page_studio_template_version_status state ON state.version_id=version.id
    WHERE version.id=$1 AND entry.withdrawn_at IS NULL AND state.withdrawn_at IS NULL FOR SHARE OF entry,state,version`, [versionId])).rows[0]
  if (!locked) throw createError({ statusCode: 404 })
  await db.query('SELECT id FROM page_studio_template_grants WHERE template_id=$1 FOR SHARE', [locked.template_id])
  const request = templateCatalogueQuery(principal.actor, undefined, 1, versionId)
  if (!(await db.query(request.sql, request.params)).rows.length) throw templateDenied()
  return locked.template_id
}
