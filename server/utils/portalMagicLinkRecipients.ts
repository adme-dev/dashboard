import { queryRowsFresh } from '~~/server/utils/db'
import { z } from 'zod'

export interface EligiblePortalUser {
  id: string
  email: string
  name: string
  status: 'active' | 'pending'
  client_name: string
}
type RecipientQuery = (sql: string, params: unknown[]) => Promise<EligiblePortalUser[]>

export function findPortalMagicLinkRecipients(email: string, redirect: string, query: RecipientQuery = queryRowsFresh) {
  const studioIndexEntry = /^\/studio\/sites\/?(?:\?|$)/.test(redirect)
  const websiteEntry = redirect.startsWith('/studio/sites/') && !studioIndexEntry
  const studioEntry = studioIndexEntry || websiteEntry
  const siteId = websiteEntry ? redirect.match(/^\/studio\/sites\/([^/?#]+)/)?.[1] : null
  if (websiteEntry && !z.string().uuid().safeParse(siteId).success) return Promise.resolve([])
  return query(`
    SELECT cu.id, cu.email, cu.name, cu.status, c.name AS client_name
    FROM client_users cu
    JOIN agency_clients c ON c.id = cu.client_id
    WHERE LOWER(cu.email) = $1
      AND (
        cu.status = 'active'
        OR (
          cu.status = 'pending'
          AND EXISTS (
            SELECT 1 FROM client_invitations AS invitation
            WHERE invitation.client_id = cu.client_id
              AND LOWER(invitation.email) = LOWER(cu.email)
              AND invitation.status = 'pending'
              AND invitation.expires_at > NOW()
          )
        )
      )
      AND LOWER(cu.email) NOT LIKE '%@portal-access.local'
      AND ($3::boolean = FALSE OR EXISTS (
        SELECT 1 FROM page_studio_site_memberships membership
        JOIN page_studio_sites site ON site.id = membership.site_id
          AND site.client_id = membership.client_id AND site.tenant_id = membership.tenant_id
        WHERE ($2::uuid IS NULL OR membership.site_id = $2) AND membership.user_id = cu.id
          AND membership.client_id = cu.client_id AND site.status IN ('draft', 'active')
          AND c.is_active = TRUE
      ))
    ORDER BY cu.created_at ASC
    LIMIT 10
  `, [email, siteId ?? null, studioEntry])
}
