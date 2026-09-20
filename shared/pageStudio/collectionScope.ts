import type { PageStudioContentScope } from './businessContent'

export const contentScopeKey = (scope: PageStudioContentScope) =>
  JSON.stringify([scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment])
