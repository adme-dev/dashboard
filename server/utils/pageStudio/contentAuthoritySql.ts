/** Closed SQL fragments for native CMS admission. Scope and login values are
 * bound by the caller; no model/client text is interpolated into SQL. Read-only
 * staff and portal viewers can retain reads without acquiring editing rights. */
export function pageStudioContentAuthoritySql(agency: boolean) {
  const live = `login.token_hash IS NOT NULL AND owner.id IS NOT NULL${agency ? '' : ' AND native_session.token_hash IS NOT NULL'}`
  const permission = (name: 'PAGE_STUDIO_VIEW' | 'PAGE_STUDIO_EDIT') => `EXISTS (
    SELECT 1 FROM role_permission_groups permission WHERE permission.role_id=staff_role.id
      AND permission.permission_group='${name}')`
  const select = agency
    ? `(${live} AND ${permission('PAGE_STUDIO_VIEW')}) AS native_can_view,
       (${live} AND owner.user_role NOT IN ('viewer','guest') AND staff_role.is_read_only=FALSE
        AND ${permission('PAGE_STUDIO_EDIT')}) AS native_can_edit`
    : `(${live}) AS native_can_view, (${live}) AS native_can_edit`
  const owner = agency
    ? `LEFT JOIN team_members owner ON owner.id::text=$3 AND owner.is_active=TRUE
        AND (owner.sessions_invalidated_at IS NULL OR login.issued_at>=owner.sessions_invalidated_at)
       LEFT JOIN custom_roles staff_role ON
        ((owner.custom_role_id IS NOT NULL AND staff_role.id=owner.custom_role_id)
         OR (owner.custom_role_id IS NULL AND staff_role.slug=owner.user_role::text AND staff_role.is_system=TRUE))`
    : `LEFT JOIN client_users owner ON owner.id::text=$3 AND owner.client_id=site.client_id AND owner.status='active'
       LEFT JOIN client_sessions native_session ON native_session.token_hash=login.token_hash
        AND native_session.client_user_id=owner.id AND native_session.expires_at>clock_timestamp()`
  return { select, joins: `LEFT JOIN page_studio_login_sessions login ON login.role='${agency ? 'agency' : 'client'}'
    AND login.token_hash=$4 AND login.user_id=$3 AND login.revoked_at IS NULL
    AND login.expires_at>clock_timestamp() AND login.expires_at=$6::timestamptz
    AND (login.role='client' OR login.issued_at=$5::timestamptz)
    ${owner}` }
}
