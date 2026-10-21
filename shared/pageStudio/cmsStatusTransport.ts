import type { z } from 'zod'
import type { CmsManagementRequestSchema } from './cmsManagementContract'

export const CMS_STATUS_URL = 'https://page-studio-management.internal/customer-cms-adoption-status'
export function isPlacedCmsStatus(request: z.infer<typeof CmsManagementRequestSchema>) {
  return request.operation === 'adoption' && request.body.action === 'status'
    && request.expectedEnvironment === 'production' && request.contentEnvironment === 'staging'
    && request.principal.source === 'customer-session' && request.principal.claims.environment === 'staging'
    && ['workspace:create', 'cms:adopt'].includes(request.principal.capability)
}
