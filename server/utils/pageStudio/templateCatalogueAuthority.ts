import { queryRowsFresh } from '~~/server/utils/db'
import type { TemplateCardRow } from './templateCatalogue'

/** Listing does not consume site capacity or require permission to create sites.
 * Keep this separate from resolvePortalPageStudioTenant's creation admission. */
export async function resolvePortalTemplateTenant(clientId: string, query = queryRowsFresh<{ tenant_id: string }>): Promise<string> {
  const rows = await query(`SELECT DISTINCT tenant_id FROM page_studio_entitlements
    WHERE client_id=$1 AND status IN ('trial','active') AND effective_from<=clock_timestamp()
      AND (effective_until IS NULL OR effective_until>clock_timestamp()) LIMIT 2`, [clientId])
  if (rows.length !== 1) throw Object.assign(new Error('Template access is unavailable.'), { statusCode: rows.length ? 409 : 403 })
  return rows[0]!.tenant_id
}

/** The existing agency is organisation-wide. Resolve its server-owned current
 * org binding freshly, never getSelectedTenant's unsigned cookie fast path.
 * The isolated staging tenant is accepted only from trusted deployment config. */
export async function resolveAgencyTemplateTenant(env: Record<string, unknown>, query = queryRowsFresh<{ tenant_id: string }>): Promise<string> {
  const staging = env.PAGE_STUDIO_STAGING_TENANT_ID
  if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'staging' && env.PAGE_STUDIO_CONTENT_ENVIRONMENT === 'staging'
    && typeof staging === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(staging)) return staging
  const rows = await query(`SELECT tenant_id FROM xero_org_connection WHERE tenant_id<>'__default__' ORDER BY updated_at DESC LIMIT 1`, [])
  if (rows.length !== 1) throw Object.assign(new Error('Template access is unavailable.'), { statusCode: 403 })
  return rows[0]!.tenant_id
}

export const queryTemplateCatalogue = (sql: string, params: unknown[]) => queryRowsFresh<TemplateCardRow>(sql, params)
