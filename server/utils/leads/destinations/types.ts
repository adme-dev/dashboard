// server/utils/leads/destinations/types.ts
import type { Lead, LeadDelivery, DispatchResult } from '~~/app/types'

export interface DestinationAdapter<C = any> {
  type: string
  validateConfig(config: unknown): { valid: boolean; errors?: Record<string, string> }
  dispatch(delivery: LeadDelivery, lead: Lead, config: C): Promise<DispatchResult>
}

export type { DispatchResult, Lead, LeadDelivery }
