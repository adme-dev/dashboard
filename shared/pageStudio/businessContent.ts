import { z } from 'zod'

// Wire contract v1 mirrors @xeroflow/protocol business-content at 758b701.
// Keep the standalone Worker contract and this API boundary compatible.
const ContentId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/)
const SiteId = z.union([z.string().min(3).max(64).regex(/^[a-z][a-z0-9_-]*$/), z.string().uuid()])
export const PageStudioContentScopeSchema = z.object({
  businessId: ContentId,
  clientId: ContentId,
  environment: z.enum(['preview', 'staging', 'production']),
  siteId: SiteId,
  tenantId: ContentId
}).strict()
export type PageStudioContentScope = z.infer<typeof PageStudioContentScopeSchema>

export function samePageStudioContentScope(a: PageStudioContentScope, b: PageStudioContentScope): boolean {
  return a.tenantId === b.tenantId && a.clientId === b.clientId && a.businessId === b.businessId
    && a.siteId === b.siteId && a.environment === b.environment
}
