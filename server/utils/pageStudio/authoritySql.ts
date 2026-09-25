/** Pure SQL fragments. Only closed, internal policy choices reach interpolation;
 * caller-owned queries retain their exact scope, prelock order and FOR SHARE. */
type AuthorityClock = 'NOW()' | 'clock_timestamp()'
type AuthoritySource = 'history' | 'session' | 'provisioning'

export function pageStudioAuthorityOwnerJoin(agency: boolean, source: AuthoritySource, time: AuthorityClock, requiredPermission: 'PAGE_STUDIO_EDIT' | 'PAGE_STUDIO_PUBLISH' = 'PAGE_STUDIO_EDIT') {
  const ownerId = source === 'provisioning'
    ? 'owner.id = $4::uuid'
    : `owner.id::text = ${source === 'session' ? 'session' : 'login'}.user_id`
  if (agency) {
    const permission = source === 'provisioning' ? 'staff_permission' : 'permission'
    return `JOIN team_members owner ON ${ownerId} AND owner.is_active = TRUE
      AND owner.user_role NOT IN ('viewer', 'guest')
      AND (owner.sessions_invalidated_at IS NULL OR login.issued_at >= owner.sessions_invalidated_at)
    JOIN custom_roles staff_role ON
      ((owner.custom_role_id IS NOT NULL AND staff_role.id = owner.custom_role_id)
       OR (owner.custom_role_id IS NULL AND staff_role.slug = owner.user_role::text AND staff_role.is_system = TRUE))
      AND staff_role.is_read_only = FALSE
    JOIN role_permission_groups ${permission} ON ${permission}.role_id = staff_role.id
      AND ${permission}.permission_group = '${requiredPermission === 'PAGE_STUDIO_PUBLISH' ? 'PAGE_STUDIO_PUBLISH' : 'PAGE_STUDIO_EDIT'}'`
  }
  return `JOIN client_users owner ON ${ownerId} AND owner.client_id = site.client_id
      AND owner.status = 'active' ${source === 'provisioning' ? 'AND owner.role IN (\'admin\', \'manager\')' : ''}
    JOIN client_sessions native_session ON native_session.token_hash = login.token_hash
      AND native_session.client_user_id = owner.id AND native_session.expires_at > ${time}
    JOIN page_studio_site_memberships membership ON membership.tenant_id = site.tenant_id
      AND membership.client_id = site.client_id AND membership.site_id = site.id
      AND membership.user_id = owner.id AND membership.role = 'editor'`
}

/** Provisioning retains its separate package-capacity and proposal policy. */
export function pageStudioEditorEntitlementJoin(time: AuthorityClock) {
  return `JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
    JOIN page_studio_entitlements entitlement ON entitlement.tenant_id = site.tenant_id
      AND entitlement.client_id = site.client_id AND entitlement.id = site.entitlement_id
      AND entitlement.status IN ('trial', 'active')
      AND entitlement.effective_from <= ${time}
      AND (entitlement.effective_until IS NULL OR entitlement.effective_until > ${time})`
}
