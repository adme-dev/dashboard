import { z } from 'zod'
import { PageStudioTemplateCardSchema, PageStudioTemplateListQuery, type PageStudioTemplateList } from '~~/shared/pageStudio/templateCatalogue'

const Id = z.string().uuid()
const Tenant = z.string().min(1).max(200)
const Session = z.string().regex(/^[a-f0-9]{64}$/)
export const TemplateActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agency'), userId: Id, tenantId: Tenant, sessionIdentity: Session }).strict(),
  z.object({ kind: z.literal('portal'), userId: Id, tenantId: Tenant, clientId: Id, sessionIdentity: Session }).strict(),
  z.object({ kind: z.literal('customer'), identityId: Id, workspaceId: Id, sessionIdentity: Session }).strict()
])
export type TemplateActor = z.infer<typeof TemplateActorSchema>
export interface TemplateCardRow { id: string, name: string, versionId: string, format: string }
export interface TemplateCatalogueDependencies {
  query: (sql: string, params: unknown[]) => Promise<TemplateCardRow[]>
  reauthorize: () => Promise<TemplateActor>
}
const denied = () => Object.assign(new Error('Template access is unavailable.'), { statusCode: 403 })

/** Grants never imply account authority. Broad published eligibility is reserved
 * in the schema, but deliberately has no active query branch in this slice. */
export function templateCatalogueQuery(actor: TemplateActor, cursor: string | undefined, limit: number) {
  const params: unknown[] = [cursor ?? null, limit + 1]
  let access: string
  if (actor.kind === 'agency') {
    params.push(actor.tenantId, actor.userId)
    access = `entry.owner_tenant_id=$3 AND EXISTS (SELECT 1 FROM team_members staff WHERE staff.id=$4 AND staff.is_active=TRUE)`
  } else if (actor.kind === 'portal') {
    params.push(actor.tenantId, actor.clientId, actor.userId, actor.sessionIdentity)
    access = `EXISTS (SELECT 1 FROM page_studio_template_grants grant_record
      WHERE grant_record.template_id=entry.id AND grant_record.audience='portal-client'
        AND grant_record.tenant_id=$3 AND grant_record.client_id=$4
        AND grant_record.revoked_at IS NULL AND grant_record.effective_from<=clock_timestamp()
        AND (grant_record.expires_at IS NULL OR grant_record.expires_at>clock_timestamp()))
      AND EXISTS (SELECT 1 FROM client_sessions session JOIN client_users usr ON usr.id=session.client_user_id
        JOIN agency_clients client ON client.id=usr.client_id
        WHERE usr.id=$5 AND usr.client_id=$4 AND usr.status='active' AND client.is_active=TRUE
        AND session.token_hash=$6 AND session.expires_at>clock_timestamp())
      AND EXISTS (SELECT 1 FROM page_studio_entitlements entitlement WHERE entitlement.tenant_id=$3
        AND entitlement.client_id=$4 AND entitlement.status IN ('active','trial')
        AND entitlement.effective_from<=clock_timestamp() AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp()))`
  } else {
    params.push(actor.workspaceId, actor.identityId, actor.sessionIdentity)
    access = `EXISTS (SELECT 1 FROM page_studio_template_grants grant_record
      WHERE grant_record.template_id=entry.id AND grant_record.audience='customer-workspace' AND grant_record.workspace_id=$3
        AND grant_record.revoked_at IS NULL AND grant_record.effective_from<=clock_timestamp()
        AND (grant_record.expires_at IS NULL OR grant_record.expires_at>clock_timestamp()))
      AND EXISTS (SELECT 1 FROM page_studio_workspace_memberships membership
        JOIN page_studio_customer_workspaces workspace ON workspace.id=membership.workspace_id
        JOIN page_studio_customer_identities identity ON identity.id=membership.identity_id
        JOIN page_studio_customer_accounts account ON account.identity_id=identity.id
        JOIN page_studio_customer_sessions session ON session.account_id=account.id
        WHERE workspace.id=$3 AND identity.id=$4 AND workspace.status='active' AND identity.status='active'
        AND identity.issuer='studio' AND identity.subject=account.id::text AND identity.portal_user_id IS NULL
        AND identity.verified_at<=clock_timestamp() AND account.status='active'
        AND membership.role IN ('owner','manager','editor','viewer') AND membership.revoked_at IS NULL
        AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
        AND session.token_hash=$5 AND session.revoked_at IS NULL AND session.expires_at>clock_timestamp()
        AND NOT EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id=workspace.id))`
  }
  return { sql: `SELECT entry.id::text, entry.name, version.id::text AS "versionId", version.format
    FROM page_studio_template_entries entry JOIN page_studio_template_versions version ON version.template_id=entry.id
    JOIN page_studio_template_version_status state ON state.version_id=version.id
    WHERE entry.withdrawn_at IS NULL AND state.withdrawn_at IS NULL AND (${access})
      AND ($1::uuid IS NULL OR version.id>$1::uuid)
    ORDER BY version.id LIMIT $2`, params }
}
export async function listPermittedTemplates(rawActor: TemplateActor, rawQuery: unknown, deps: TemplateCatalogueDependencies): Promise<PageStudioTemplateList> {
  const actor = TemplateActorSchema.parse(rawActor)
  const query = PageStudioTemplateListQuery.parse(rawQuery)
  const request = templateCatalogueQuery(actor, query.cursor, query.limit)
  // Do not release initial rows across an awaited authority refresh. Read grants
  // again afterwards so withdrawal/expiry during refresh is reflected as well.
  await deps.query(request.sql, request.params)
  const current = TemplateActorSchema.parse(await deps.reauthorize())
  if (JSON.stringify(current) !== JSON.stringify(actor)) throw denied()
  const rows = await deps.query(request.sql, request.params)
  const items = rows.slice(0, query.limit).map(row => PageStudioTemplateCardSchema.parse({
    id: row.id, name: row.name, versionId: row.versionId, format: row.format, category: 'automotive', status: 'preparing',
    thumbnail: null, canPreview: false, canUse: false, unavailableReason: 'Preview and independent editing are being prepared.'
  }))
  return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.versionId : null }
}
