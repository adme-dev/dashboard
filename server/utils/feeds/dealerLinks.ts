import { queryOne as dbQueryOne } from '~~/server/utils/db'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from './constants'
import type { DealerLink, FeedProviderContext } from './types'

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}

export function rowToDealerLink(row: any): DealerLink {
  return {
    clientId: String(row.client_id),
    providerId: String(row.provider_id),
    externalOrgId: String(row.external_org_id),
    sellerRefs: asStringArray(row.seller_refs),
    defaultFeedIds: asStringArray(row.default_feed_ids),
  }
}

/** Build the provider call-context from a link — keeps org scoping safe-by-construction. */
export function linkToContext(link: DealerLink, actingUserEmail: string): FeedProviderContext {
  return { actingUserEmail, externalOrgId: link.externalOrgId }
}

/** deps.queryOne is injected in tests; defaults to the real db helper at runtime. */
export async function getDealerLink(
  clientId: string,
  providerId: string = SOCIAL_DASHBOARD_PROVIDER_ID,
  deps: { queryOne?: typeof dbQueryOne } = {},
): Promise<DealerLink | null> {
  const queryOne = deps.queryOne ?? dbQueryOne
  const row = await queryOne(
    `SELECT client_id, provider_id, external_org_id, seller_refs, default_feed_ids
     FROM client_feed_links WHERE client_id = $1 AND provider_id = $2 AND status = 'active'`,
    [clientId, providerId],
  )
  return row ? rowToDealerLink(row) : null
}
