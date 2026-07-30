import type { MaybeRefOrGetter } from 'vue'

export type CrmInboundEmailRouteStatus = 'active' | 'never_used' | 'revoked' | 'expired'

/**
 * The safe projection returned by the CRM route-management APIs.
 * Addresses and route-token material are intentionally never part of a list row.
 */
export interface CrmInboundEmailRoute {
  id: string
  label: string
  kind: 'lead_inbox'
  clientId?: string
  recipientDomain: string
  status: CrmInboundEmailRouteStatus
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  canRotate: boolean
  canRevoke: boolean
  addressAvailable: false
}

export interface CrmInboundEmailRouteListResponse {
  items: CrmInboundEmailRoute[]
}

export interface CrmInboundEmailRouteIssuedResponse {
  route: CrmInboundEmailRoute
  issuedAddress: string
  addressShownOnce: true
}

export interface CrmInboundEmailRouteRevokeResponse {
  route: CrmInboundEmailRoute
}

export interface UseCrmInboundEmailRouteOptions {
  apiBase: MaybeRefOrGetter<string>
  clientId?: MaybeRefOrGetter<string | undefined>
}
