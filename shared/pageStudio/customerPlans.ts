export interface CustomerPlanLimits {
  pagesPerSiteLimit: number
  storageBytesLimit: number
  domainLimit: number
  aiOperationLimit: number
  buildLimit: number
  trafficBytesLimit: number
}
export interface CustomerPlanTarget {
  workspaceId: string
  workspaceName: string
  siteId: string
  siteName: string
  entitlementId: string
  planKey: string
  status: string
  effectiveUntil: string | null
  eligible: boolean
  limits: CustomerPlanLimits
}
export interface CustomerPlanTargets {
  targets: CustomerPlanTarget[]
  nextCursor: string | null
}
