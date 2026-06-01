// server/utils/socialInbox/automationTypes.ts
// Shared server-side types for the Phase 2b reply automation engine.
import type { ChannelType } from './types'

export type AutomationMode = 'off' | 'suggest' | 'approval' | 'autopilot'
export type EffectiveMode = 'approval' | 'autopilot'
export type ApproverType = 'staff' | 'client' | 'none'
export type QueueStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'failed' | 'skipped'

export interface BusinessHours {
  tz: string                 // IANA tz, e.g. "Australia/Sydney"
  days: number[]             // ISO weekdays 1=Mon..7=Sun
  start: string              // "HH:MM" 24h
  end: string                // "HH:MM" 24h
}

export interface RuleConditions {
  ratingMin?: number         // reviews: inclusive
  ratingMax?: number         // reviews: inclusive
  keywordsAny?: string[]     // inbound content must contain at least one (case-insensitive)
  keywordsNone?: string[]    // inbound content must contain none
  businessHoursOnly?: boolean
}

export interface AutomationRule {
  id: string
  client_id: string
  name: string
  platform: string | null
  channel_type: ChannelType | null
  mode: AutomationMode
  conditions: RuleConditions
  action: { aiPrompt?: string }
  approval_by: ApproverType
  rate_limit: number
  confidence_floor: number
  business_hours: BusinessHours | null
  priority: number
  enabled: boolean
}

/** The inbound context the engine evaluates a rule against. */
export interface AutomationContext {
  conversationId: string
  clientId: string
  platform: string
  channelType: ChannelType
  rating: number | null
  inboundMessageId: string
  inboundContent: string
  participantName: string | null
  now: Date
}

/** Result of an AI draft generation. */
export interface ReplyDraft {
  reply: string
  confidence: number   // 0..1
  risk: boolean        // model self-flag (secondary to the deterministic guard)
}
