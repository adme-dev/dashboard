import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

const Scope = z.object({ tenantId: z.string().min(1).max(128), siteId: z.string().uuid(), actorId: z.string().uuid() }).strict()
const Write = Scope.extend({ userId: z.string().uuid(), role: z.enum(['editor', 'viewer', 'none']) })
type ScopeInput = z.infer<typeof Scope>
interface Site { client_id: string, name: string }
interface InvitedUser { id: string, name: string, email: string, status: string, role: 'editor' | 'viewer' | null }
const runDefault: RunPageStudioTransaction = callback => transaction(db => callback(db as unknown as PageStudioQueryClient))

async function authorize(db: PageStudioQueryClient, input: ScopeInput): Promise<Site> {
  // Access delegation is reserved to current agency administrators, including in development.
  const actor = await db.query(`SELECT id FROM team_members
    WHERE id = $1 AND is_active = TRUE AND user_role IN ('owner', 'admin') FOR SHARE`, [input.actorId])
  if (!actor.rows.length) throw createError({ statusCode: 403, statusMessage: 'An agency administrator must manage CMS access.' })
  // Serialize grants on this site and prevent client/site changes during assignment.
  const site = await db.query<Site>(`SELECT site.client_id, site.name FROM page_studio_sites site
    JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
    WHERE site.id = $1 AND site.tenant_id = $2 AND site.status IN ('draft', 'active')
    FOR UPDATE OF site FOR SHARE OF client`, [input.siteId, input.tenantId])
  if (!site.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Website not available' })
  return site.rows[0]
}

export async function readInvitedSiteAccess(raw: ScopeInput, run = runDefault) {
  const input = Scope.parse(raw)
  return run(async (db) => {
    const site = await authorize(db, input)
    const users = await db.query<InvitedUser>(`SELECT cu.id, cu.name, cu.email, cu.status, membership.role
      FROM client_users cu LEFT JOIN page_studio_site_memberships membership
        ON membership.user_id = cu.id AND membership.site_id = $2
        AND membership.tenant_id = $3 AND membership.client_id = cu.client_id
      WHERE cu.client_id = $1 AND (cu.status IN ('active', 'pending') OR membership.user_id IS NOT NULL)
        AND LOWER(cu.email) NOT LIKE '%@portal-access.local'
      ORDER BY cu.name, cu.id`, [site.client_id, input.siteId, input.tenantId])
    return { name: site.name, users: users.rows }
  })
}

export async function writeInvitedSiteAccess(raw: z.infer<typeof Write>, run = runDefault) {
  const parsed = Write.safeParse(raw)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid CMS access request' })
  const input = parsed.data
  return run(async (db) => {
    const site = await authorize(db, input)
    // Match IDs to this client; sharing an email address with another client grants nothing.
    const target = await db.query(`SELECT cu.id FROM client_users cu
      WHERE cu.id = $1 AND cu.client_id = $2 AND LOWER(cu.email) NOT LIKE '%@portal-access.local'
        AND ($3 = 'none' OR cu.status = 'active' OR (cu.status = 'pending' AND EXISTS (
          SELECT 1 FROM client_invitations invitation WHERE invitation.client_id = cu.client_id
            AND LOWER(invitation.email) = LOWER(cu.email) AND invitation.status = 'pending'
            AND invitation.expires_at > clock_timestamp())))
      FOR SHARE OF cu`, [input.userId, site.client_id, input.role])
    if (!target.rows.length) throw createError({ statusCode: 404, statusMessage: 'Invite this user to the website client before assigning access.' })
    const previous = await db.query<{ role: string }>(`SELECT role FROM page_studio_site_memberships
      WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND user_id = $4 FOR UPDATE`,
    [input.tenantId, site.client_id, input.siteId, input.userId])
    const previousRole = previous.rows[0]?.role ?? 'none'
    if (previousRole === input.role) return { role: input.role }
    if (input.role === 'none') {
      await db.query(`DELETE FROM page_studio_site_memberships
        WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND user_id = $4`,
      [input.tenantId, site.client_id, input.siteId, input.userId])
    } else {
      await db.query(`INSERT INTO page_studio_site_memberships (tenant_id, client_id, site_id, user_id, role, granted_by)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (site_id, user_id) DO UPDATE
        SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, updated_at = clock_timestamp()
        WHERE page_studio_site_memberships.tenant_id = EXCLUDED.tenant_id
          AND page_studio_site_memberships.client_id = EXCLUDED.client_id`,
      [input.tenantId, site.client_id, input.siteId, input.userId, input.role, input.actorId])
    }
    await db.query(`INSERT INTO page_studio_audit_events
      (tenant_id, client_id, site_id, actor_id, actor_role, action, resource_type, resource_id, metadata)
      VALUES ($1, $2, $3, $4, 'agency', 'site.membership.changed', 'site_membership', $5, $6::jsonb)`,
    [input.tenantId, site.client_id, input.siteId, input.actorId, input.userId, JSON.stringify({ previousRole, role: input.role })])
    return { role: input.role }
  })
}
